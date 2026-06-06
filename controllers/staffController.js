const { supabase, supabaseAdmin } = require("../config/supabase");

const createStaff = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hall_id = req.user.hall_id;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    const allowedRoles = ["manager", "staff"];
    const staffRole = allowedRoles.includes(role) ? role : "staff";

    // ---- 1. Check active subscription + user limit ----
    const today = new Date().toISOString().split("T")[0];

    const { data: sub, error: subError } = await supabaseAdmin
      .from("hall_subscriptions")
      .select("package_id, packages(max_users, name)")
      .eq("hall_id", hall_id)
      .eq("status", "active")
      .gte("end_date", today)
      .maybeSingle();

    if (subError || !sub) {
      return res.status(403).json({ message: "No active subscription found" });
    }

    const maxUsers = sub.packages?.max_users;

    if (maxUsers !== null && maxUsers !== undefined) {
      const { count } = await supabaseAdmin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("hall_id", hall_id);

      if (count >= maxUsers) {
        return res.status(403).json({
          message: `User limit reached. Your ${sub.packages.name} plan allows a maximum of ${maxUsers} users. Please upgrade your plan.`,
        });
      }
    }

    // ---- 2. Create Supabase Auth user via signUp (auto-sends confirmation email) ----
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: staffRole, hall_id },
      },
    });

    if (authError || !authData?.user) {
      return res.status(400).json({ message: authError?.message || "Auth user creation failed" });
    }

    // ---- 3. Insert into users table ----
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .insert([{
        name,
        email,
        password: "supabase_auth",
        role: staffRole,
        hall_id,
        auth_user_id: authData.user.id,
      }])
      .select("id, name, email, role, hall_id, created_at")
      .single();

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ message: userError.message });
    }

    // ---- 4. Link staff member in user_halls ----
    try {
      const isDifferentStaff = req.user.different_staff_management || false;
      if (isDifferentStaff) {
        // Link to active hall only
        await supabaseAdmin.from("user_halls").insert([{
          user_id: user.id,
          hall_id: hall_id,
        }]);
      } else {
        // Link to all of the owner's accessible halls
        const { data: ownerHalls } = await supabaseAdmin
          .from("user_halls")
          .select("hall_id")
          .eq("user_id", req.user.id);

        const links = (ownerHalls || []).map((oh) => ({
          user_id: user.id,
          hall_id: oh.hall_id,
        }));

        if (links.length > 0) {
          await supabaseAdmin.from("user_halls").insert(links);
        }
      }
    } catch (linkErr) {
      console.error("Error linking staff in user_halls:", linkErr);
      // Non-critical
    }

    res.status(201).json({
      message: `Staff created. A confirmation email has been sent to ${email}.`,
      user,
    });
  } catch (err) {
    console.error("createStaff error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getStaff = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, created_at")
      .eq("hall_id", hall_id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const hall_id = req.user.hall_id;

    const allowedRoles = ["manager", "staff"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Role must be manager or staff" });
    }

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id, hall_id")
      .eq("id", id)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ message: "Staff not found in your hall" });

    const { error } = await supabaseAdmin.from("users").update({ role }).eq("id", id);
    if (error) return res.status(500).json({ message: error.message });

    res.json({ message: "Staff role updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const hall_id = req.user.hall_id;

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id, hall_id, auth_user_id, role")
      .eq("id", id)
      .eq("hall_id", hall_id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ message: "Staff not found in your hall" });
    if (existing.role === "owner") return res.status(403).json({ message: "Cannot delete hall owner" });

    await supabaseAdmin.from("users").delete().eq("id", id);

    if (existing.auth_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(existing.auth_user_id);
    }

    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { createStaff, getStaff, updateStaff, deleteStaff };