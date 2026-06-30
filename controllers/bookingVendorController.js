const { supabaseAdmin } = require("../config/supabase");
const { logActivity } = require("./activityLogController");

/* ============================================================
   ALLOCATE VENDOR TO BOOKING
   ============================================================ */
const allocateVendor = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const hall_id = req.user.hall_id;
    const {
      vendor_id,
      service_type,
      allocated_cost,
      amount_paid,
      payment_status,
      notes,
    } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ message: "vendor_id is required" });
    }

    // 1. Verify booking exists
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, start_date, end_date, event_name, booking_number")
      .eq("id", bookingId)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (bookingError) return res.status(500).json({ message: bookingError.message });
    if (!booking) return res.status(404).json({ message: "Booking not found in your hall" });

    // 2. Verify vendor exists
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from("vendors")
      .select("id, vendor_name, service_type, status")
      .eq("id", vendor_id)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (vendorError) return res.status(500).json({ message: vendorError.message });
    if (!vendor) return res.status(404).json({ message: "Vendor not found in your hall" });

    if (vendor.status === "blacklisted") {
      return res.status(400).json({ message: "Cannot allocate a blacklisted vendor partner" });
    }

    // 3. Check for double booking conflicts
    const { data: vendorAllocations, error: allocationsError } = await supabaseAdmin
      .from("booking_vendors")
      .select(`
        booking_id,
        bookings ( id, event_name, start_date, end_date, booking_number )
      `)
      .eq("vendor_id", vendor_id)
      .eq("hall_id", hall_id);

    if (allocationsError) return res.status(500).json({ message: allocationsError.message });

    let conflict = false;
    let conflictMessage = "";

    if (vendorAllocations && vendorAllocations.length > 0) {
      const newStart = new Date(booking.start_date).getTime();
      const newEnd = new Date(booking.end_date || booking.start_date).getTime();

      for (const allocation of vendorAllocations) {
        if (!allocation.bookings) continue;
        const existStart = new Date(allocation.bookings.start_date).getTime();
        const existEnd = new Date(allocation.bookings.end_date || allocation.bookings.start_date).getTime();

        // Check date overlap
        if (newStart <= existEnd && newEnd >= existStart) {
          conflict = true;
          conflictMessage = `Vendor "${vendor.vendor_name}" is already assigned to event "${allocation.bookings.event_name}" (${allocation.bookings.booking_number}) on this date (${allocation.bookings.start_date}).`;
          break;
        }
      }
    }

    const cost = Number(allocated_cost || 0);
    const paid = Number(amount_paid || 0);

    // Deduce payment status
    let finalStatus = payment_status || "unpaid";
    if (payment_status === undefined) {
      if (paid >= cost && cost > 0) {
        finalStatus = "paid";
      } else if (paid > 0) {
        finalStatus = "partially_paid";
      } else {
        finalStatus = "unpaid";
      }
    }

    // Serialize metadata into notes column
    const serializedNotes = JSON.stringify({
      amount_paid: paid,
      payment_status: finalStatus,
      user_notes: notes || ""
    });

    // 4. Save allocation record
    const { data, error } = await supabaseAdmin
      .from("booking_vendors")
      .insert([{
        hall_id,
        booking_id: bookingId,
        vendor_id,
        assigned_amount: cost,
        notes: serializedNotes,
      }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "This vendor is already allocated to this booking" });
      }
      return res.status(500).json({ message: error.message });
    }

    // Log Activity
    await logActivity({
      hall_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "vendor.allocated",
      entity_type: "booking",
      entity_id: bookingId,
      description: `Allocated vendor ${vendor.vendor_name} (${service_type || vendor.service_type}) to booking #${booking.booking_number}`,
      metadata: { vendor_id, booking_id: bookingId, cost, conflict },
    });

    const responseData = data ? {
      ...data,
      allocated_cost: data.assigned_amount,
      amount_paid: paid,
      payment_status: finalStatus,
      notes: notes || "",
      service_type: vendor.service_type || "other",
    } : null;

    res.status(201).json({
      message: conflict 
        ? `Vendor allocated, but a scheduling conflict was detected: ${conflictMessage}`
        : "Vendor allocated to booking successfully",
      data: responseData,
      conflict,
      conflictMessage,
    });
  } catch (err) {
    console.error("allocateVendor error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   UPDATE VENDOR ALLOCATION
   ============================================================ */
const updateAllocation = async (req, res) => {
  try {
    const { bookingId, vendorId } = req.params;
    const hall_id = req.user.hall_id;
    const { allocated_cost, amount_paid, payment_status, notes } = req.body;

    // 1. Check if allocation exists
    const { data: existing, error: findError } = await supabaseAdmin
      .from("booking_vendors")
      .select("*, vendors(vendor_name)")
      .eq("booking_id", bookingId)
      .eq("vendor_id", vendorId)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (findError) return res.status(500).json({ message: findError.message });
    if (!existing) return res.status(404).json({ message: "Vendor allocation record not found" });

    // Read existing notes to preserve values
    let existingNotes = { amount_paid: 0, payment_status: "unpaid", user_notes: "" };
    try {
      if (existing.notes && existing.notes.startsWith("{")) {
        const parsed = JSON.parse(existing.notes);
        existingNotes.amount_paid = parsed.amount_paid || 0;
        existingNotes.payment_status = parsed.payment_status || "unpaid";
        existingNotes.user_notes = parsed.user_notes || "";
      } else {
        existingNotes.user_notes = existing.notes || "";
      }
    } catch (e) {
      existingNotes.user_notes = existing.notes || "";
    }

    const cost = allocated_cost !== undefined ? Number(allocated_cost) : Number(existing.assigned_amount || 0);
    const paid = amount_paid !== undefined ? Number(amount_paid) : Number(existingNotes.amount_paid || 0);

    let finalStatus = payment_status;
    if (finalStatus === undefined) {
      if (allocated_cost !== undefined || amount_paid !== undefined) {
        if (paid >= cost && cost > 0) {
          finalStatus = "paid";
        } else if (paid > 0) {
          finalStatus = "partially_paid";
        } else {
          finalStatus = "unpaid";
        }
      } else {
        finalStatus = existingNotes.payment_status;
      }
    }

    const updates = {};
    if (allocated_cost !== undefined) updates.assigned_amount = cost;
    
    const newNotes = {
      amount_paid: paid,
      payment_status: finalStatus,
      user_notes: notes !== undefined ? notes : existingNotes.user_notes
    };
    updates.notes = JSON.stringify(newNotes);

    // 2. Perform update
    const { data, error } = await supabaseAdmin
      .from("booking_vendors")
      .update(updates)
      .eq("booking_id", bookingId)
      .eq("vendor_id", vendorId)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    // Log Activity
    await logActivity({
      hall_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "vendor.allocation_updated",
      entity_type: "booking",
      entity_id: bookingId,
      description: `Updated allocation details for vendor ${existing.vendors?.vendor_name || vendorId}`,
      metadata: { booking_id: bookingId, vendor_id: vendorId, updates },
    });

    const responseData = data ? {
      ...data,
      allocated_cost: data.assigned_amount,
      amount_paid: newNotes.amount_paid,
      payment_status: newNotes.payment_status,
      notes: newNotes.user_notes,
    } : null;

    res.json({ message: "Vendor allocation updated successfully", data: responseData });
  } catch (err) {
    console.error("updateAllocation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   DEALLOCATE VENDOR FROM BOOKING
   ============================================================ */
const deallocateVendor = async (req, res) => {
  try {
    const { bookingId, vendorId } = req.params;
    const hall_id = req.user.hall_id;

    // 1. Verify existence
    const { data: existing, error: findError } = await supabaseAdmin
      .from("booking_vendors")
      .select("*, vendors(vendor_name)")
      .eq("booking_id", bookingId)
      .eq("vendor_id", vendorId)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (findError) return res.status(500).json({ message: findError.message });
    if (!existing) return res.status(404).json({ message: "Vendor allocation record not found" });

    // 2. Delete allocation
    const { error } = await supabaseAdmin
      .from("booking_vendors")
      .delete()
      .eq("booking_id", bookingId)
      .eq("vendor_id", vendorId);

    if (error) return res.status(500).json({ message: error.message });

    // Log Activity
    await logActivity({
      hall_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "vendor.deallocated",
      entity_type: "booking",
      entity_id: bookingId,
      description: `Deallocated vendor ${existing.vendors?.vendor_name || vendorId} from booking`,
      metadata: { booking_id: bookingId, vendor_id: vendorId },
    });

    res.json({ message: "Vendor deallocated from booking successfully" });
  } catch (err) {
    console.error("deallocateVendor error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   GET BOOKING ALLOCATED VENDORS
   ============================================================ */
const getBookingVendors = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const hall_id = req.user.hall_id;

    const { data, error } = await supabaseAdmin
      .from("booking_vendors")
      .select(`
        *,
        vendors ( id, vendor_name, phone, service_type, upi_id )
      `)
      .eq("booking_id", bookingId)
      .eq("hall_id", hall_id);

    if (error) return res.status(500).json({ message: error.message });

    const mapped = (data || []).map(item => {
      let parsedNotes = { amount_paid: 0, payment_status: "unpaid", user_notes: "" };
      try {
        if (item.notes && item.notes.startsWith("{")) {
          const parsed = JSON.parse(item.notes);
          parsedNotes.amount_paid = parsed.amount_paid || 0;
          parsedNotes.payment_status = parsed.payment_status || "unpaid";
          parsedNotes.user_notes = parsed.user_notes || "";
        } else {
          parsedNotes.user_notes = item.notes || "";
        }
      } catch (e) {
        parsedNotes.user_notes = item.notes || "";
      }

      return {
        ...item,
        allocated_cost: item.assigned_amount,
        amount_paid: parsedNotes.amount_paid,
        payment_status: parsedNotes.payment_status,
        notes: parsedNotes.user_notes,
        service_type: item.vendors?.service_type || "other"
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("getBookingVendors error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   GET VENDOR ALLOCATIONS (Roseter History)
   ============================================================ */
const getVendorAllocations = async (req, res) => {
  try {
    const { id } = req.params; // Vendor ID
    const hall_id = req.user.hall_id;

    const { data, error } = await supabaseAdmin
      .from("booking_vendors")
      .select(`
        *,
        bookings ( id, event_name, start_date, end_date, status, booking_number )
      `)
      .eq("vendor_id", id)
      .eq("hall_id", hall_id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const mapped = (data || []).map(item => {
      let parsedNotes = { amount_paid: 0, payment_status: "unpaid", user_notes: "" };
      try {
        if (item.notes && item.notes.startsWith("{")) {
          const parsed = JSON.parse(item.notes);
          parsedNotes.amount_paid = parsed.amount_paid || 0;
          parsedNotes.payment_status = parsed.payment_status || "unpaid";
          parsedNotes.user_notes = parsed.user_notes || "";
        } else {
          parsedNotes.user_notes = item.notes || "";
        }
      } catch (e) {
        parsedNotes.user_notes = item.notes || "";
      }

      return {
        ...item,
        allocated_cost: item.assigned_amount,
        amount_paid: parsedNotes.amount_paid,
        payment_status: parsedNotes.payment_status,
        notes: parsedNotes.user_notes
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("getVendorAllocations error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   GET VENDOR ALLOCATION STATS
   ============================================================ */
const getVendorAllocationStats = async (req, res) => {
  try {
    const { id } = req.params; // Vendor ID
    const hall_id = req.user.hall_id;

    const { data, error } = await supabaseAdmin
      .from("booking_vendors")
      .select("assigned_amount, notes")
      .eq("vendor_id", id)
      .eq("hall_id", hall_id);

    if (error) return res.status(500).json({ message: error.message });

    const total_bookings = data?.length || 0;
    const total_earnings = data?.reduce((sum, a) => sum + Number(a.assigned_amount || 0), 0) || 0;
    
    let total_paid = 0;
    (data || []).forEach(item => {
      try {
        if (item.notes && item.notes.startsWith("{")) {
          const parsed = JSON.parse(item.notes);
          total_paid += Number(parsed.amount_paid || 0);
        }
      } catch (e) {}
    });

    const total_pending = Math.max(0, total_earnings - total_paid);

    res.json({
      total_bookings,
      total_earnings,
      total_paid,
      total_pending,
    });
  } catch (err) {
    console.error("getVendorAllocationStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  allocateVendor,
  updateAllocation,
  deallocateVendor,
  getBookingVendors,
  getVendorAllocations,
  getVendorAllocationStats,
};
