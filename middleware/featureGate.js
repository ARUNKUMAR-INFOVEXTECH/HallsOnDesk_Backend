const { supabaseAdmin } = require("../config/supabase");

/**
 * Gating middleware to restrict backend API access to features depending on the active SaaS subscription plan.
 * Super Admins bypass all restrictions.
 */
module.exports = (feature) => {
  return async (req, res, next) => {
    if (req.user.role === "super_admin") return next();

    const hall_id = req.user.primary_hall_id || req.user.hall_id;
    if (!hall_id || hall_id === "all") {
      return res.status(403).json({ message: "Access forbidden: No active hall scope found." });
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: sub } = await supabaseAdmin
      .from("hall_subscriptions")
      .select("status, end_date, packages(name)")
      .eq("hall_id", hall_id)
      .in("status", ["active", "trial"])
      .gte("end_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub || !sub.packages) {
      return res.status(403).json({ message: "Access forbidden: No active subscription plan found." });
    }

    const planName = (sub.packages.name || "").toLowerCase();

    // Check feature access based on the package matrix
    let isAllowed = false;
    switch (feature) {
      case "enquiries":
      case "vendors":
      case "payroll":
      case "reports":
        // Requires a Digital Transformation plan (contains 'transformation', 'pro', 'deluxe')
        isAllowed = planName.includes("transformation") || planName.includes("pro") || planName.includes("deluxe");
        break;
      case "multihall":
      case "whatsapp":
        // Requires a Premium plan (contains 'premium')
        isAllowed = planName.includes("premium");
        break;
      default:
        isAllowed = false;
    }

    if (!isAllowed) {
      return res.status(403).json({
        message: `Feature access locked: The requested feature "${feature}" is not included in your current subscription plan.`
      });
    }

    next();
  };
};
