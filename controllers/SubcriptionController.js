const { supabaseAdmin } = require("../config/supabase");
const { logActivity } = require("./activityLogController");

/* Get subscription for a hall */
const getSubscription = async (req, res) => {
  const hall_id = req.params.hall_id || req.user.hall_id;

  const { data, error } = await supabaseAdmin
    .from("hall_subscriptions")
    .select(`*, packages(name, price, billing_cycle, features, max_users, max_bookings)`)
    .eq("hall_id", hall_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ message: error.message });
  if (!data) return res.status(404).json({ message: "No subscription found" });

  const today = new Date().toISOString().split("T")[0];
  if ((data.status === "active" || data.status === "trial") && data.end_date < today) {
    data.status = "expired";
  }

  res.json(data);
};

/* Renew/extend subscription */
const renewSubscription = async (req, res) => {
  const { hall_id } = req.params;
  const { months = 1 } = req.body;

  const { data: sub } = await supabaseAdmin
    .from("hall_subscriptions")
    .select("id, end_date")
    .eq("hall_id", hall_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return res.status(404).json({ message: "Subscription not found" });

  const currentEnd = new Date(sub.end_date);
  currentEnd.setMonth(currentEnd.getMonth() + months);

  const { error } = await supabaseAdmin
    .from("hall_subscriptions")
    .update({
      end_date: currentEnd.toISOString().split("T")[0],
      status: "active",
      payment_status: "paid",
    })
    .eq("id", sub.id);

  if (error) return res.status(500).json({ message: error.message });

  // Reactivate hall if suspended
  await supabaseAdmin
    .from("marriage_halls")
    .update({ status: "active" })
    .eq("id", hall_id);

  res.json({ message: `Subscription renewed for ${months} month(s)`, new_end_date: currentEnd });
};

/* Change package */
const changePackage = async (req, res) => {
  const { hall_id } = req.params;
  const { package_id } = req.body;

  if (!package_id) return res.status(400).json({ message: "package_id required" });

  const { error } = await supabaseAdmin
    .from("hall_subscriptions")
    .update({ package_id })
    .eq("hall_id", hall_id)
    .eq("status", "active");

  if (error) return res.status(500).json({ message: error.message });
  res.json({ message: "Package changed successfully" });
};

/* Request package change / renewal (Owner submission) */
const requestSubscriptionChange = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;
    const { package_id, request_type = "upgrade", notes = "" } = req.body;

    let packageName = "Renewal";
    if (package_id) {
      const { data: pkg } = await supabaseAdmin
        .from("packages")
        .select("name")
        .eq("id", package_id)
        .maybeSingle();
      if (pkg) packageName = pkg.name;
    }

    // Log Activity
    await logActivity({
      hall_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "subscription.request_change",
      entity_type: "subscription",
      description: `Requested plan ${request_type} to ${packageName}. Notes: ${notes}`,
      metadata: { package_id, request_type, notes },
    });

    // Create notification for operators
    await supabaseAdmin.from("notifications").insert([{
      hall_id,
      type: "subscription_request",
      title: "Plan Request Submitted",
      message: `Request for ${request_type} to ${packageName} has been logged. Support will contact you shortly.`,
      entity_type: "subscription",
      is_read: false,
    }]);

    res.json({ message: "Subscription request submitted successfully. Our team will contact you shortly." });
  } catch (err) {
    console.error("requestSubscriptionChange error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* Submit subscription payment (Owner remittance submission) */
const submitSubscriptionPayment = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;
    const { package_id, amount, payment_method, transaction_ref_no, notes = "" } = req.body;

    if (!package_id || !amount || !payment_method || !transaction_ref_no) {
      return res.status(400).json({ message: "Missing required billing details" });
    }

    if (payment_method !== "upi" && payment_method !== "bank_transfer") {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // Validate UTR (must be exactly 12 digits numeric)
    const utrRegex = /^\d{12}$/;
    if (!utrRegex.test(transaction_ref_no)) {
      return res.status(400).json({ message: "Reference number (UTR) must be exactly 12 numeric digits" });
    }

    // Check if UTR is already approved
    const { data: existingUtr } = await supabaseAdmin
      .from("subscription_payments")
      .select("id")
      .eq("transaction_ref_no", transaction_ref_no)
      .eq("status", "approved")
      .maybeSingle();

    if (existingUtr) {
      return res.status(400).json({ message: "This transaction reference number (UTR) has already been approved and credited." });
    }

    // Insert subscription payment log
    const { data: newPayment, error } = await supabaseAdmin
      .from("subscription_payments")
      .insert([{
        hall_id,
        package_id,
        amount: parseFloat(amount),
        payment_method,
        transaction_ref_no,
        status: "pending",
        notes
      }])
      .select()
      .single();

    if (error) {
      console.error("submitSubscriptionPayment insert error:", error);
      return res.status(500).json({ message: error.message });
    }

    // Create activity log
    await logActivity({
      hall_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "subscription.payment_submitted",
      entity_type: "subscription_payment",
      description: `Submitted payment of ₹${amount} via ${payment_method.toUpperCase()} (UTR: ${transaction_ref_no}) for verification.`,
      metadata: { payment_id: newPayment.id, amount, transaction_ref_no, payment_method }
    });

    // Create system notification for Super Admins (hall_id: null)
    const { data: hall } = await supabaseAdmin
      .from("marriage_halls")
      .select("hall_name")
      .eq("id", hall_id)
      .maybeSingle();

    const hallName = hall?.hall_name || "A venue";

    await supabaseAdmin.from("notifications").insert([{
      hall_id: null, // super admin alert
      type: "subscription_payment_pending",
      title: "Pending Subscription Payment",
      message: `${hallName} submitted ₹${amount} (UTR: ${transaction_ref_no}) for verification.`,
      entity_type: "subscription_payment",
      entity_id: newPayment.id,
      is_read: false
    }]);

    res.json({ message: "Remittance details submitted successfully. Verification will complete within 2-4 business hours." });
  } catch (err) {
    console.error("submitSubscriptionPayment error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* Get payment history for owner */
const getSubscriptionPaymentHistory = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;
    const { data, error } = await supabaseAdmin
      .from("subscription_payments")
      .select("*, packages(name)")
      .eq("hall_id", hall_id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data || []);
  } catch (err) {
    console.error("getSubscriptionPaymentHistory error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getSubscription,
  renewSubscription,
  changePackage,
  requestSubscriptionChange,
  submitSubscriptionPayment,
  getSubscriptionPaymentHistory
};