const { supabaseAdmin } = require("../config/supabase");

/* ============================================================
   GET ALL PRICING RULES FOR A HALL
   ============================================================ */
const getPricingRules = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;

    const { data, error } = await supabaseAdmin
      .from("venue_pricing_rules")
      .select("*")
      .eq("hall_id", hall_id)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    res.json(data);
  } catch (err) {
    console.error("getPricingRules error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   CREATE PRICING RULE
   ============================================================ */
const createPricingRule = async (req, res) => {
  try {
    const hall_id = req.user.hall_id;
    const {
      rule_name,
      pricing_type,
      effective_date,
      expiry_date,
      adjustment_type,
      adjustment_value,
      priority,
      notes
    } = req.body;

    // Validate inputs
    if (!rule_name || !pricing_type || !effective_date || !expiry_date || !adjustment_type || adjustment_value === undefined) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const allowedTypes = ['season', 'weekend', 'festival', 'holiday', 'peak', 'muhurtham', 'special'];
    if (!allowedTypes.includes(pricing_type)) {
      return res.status(400).json({ message: "Invalid pricing type" });
    }

    if (!['percentage', 'fixed'].includes(adjustment_type)) {
      return res.status(400).json({ message: "Invalid adjustment type" });
    }

    // Role verification: only owners and managers can write configurations
    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      return res.status(403).json({ message: "Forbidden: Owner or manager permissions required" });
    }

    const ruleData = {
      hall_id,
      rule_name,
      pricing_type,
      effective_date,
      expiry_date,
      adjustment_type,
      adjustment_value: Number(adjustment_value),
      priority: priority !== undefined ? Number(priority) : 1,
      notes: notes || null
    };

    const { data, error } = await supabaseAdmin
      .from("venue_pricing_rules")
      .insert([ruleData])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    res.status(201).json({ message: "Pricing rule created successfully", data });
  } catch (err) {
    console.error("createPricingRule error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   UPDATE PRICING RULE
   ============================================================ */
const updatePricingRule = async (req, res) => {
  try {
    const { id } = req.params;
    const hall_id = req.user.hall_id;
    const updates = req.body;

    // Role check
    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      return res.status(403).json({ message: "Forbidden: Owner or manager permissions required" });
    }

    // Sanitize parameters to avoid manual ID/Hall modifications
    delete updates.id;
    delete updates.hall_id;
    delete updates.created_at;

    if (updates.adjustment_value !== undefined) {
      updates.adjustment_value = Number(updates.adjustment_value);
    }
    if (updates.priority !== undefined) {
      updates.priority = Number(updates.priority);
    }

    const { data, error } = await supabaseAdmin
      .from("venue_pricing_rules")
      .update(updates)
      .eq("id", id)
      .eq("hall_id", hall_id)
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "Pricing rule not found" });

    res.json({ message: "Pricing rule updated successfully", data });
  } catch (err) {
    console.error("updatePricingRule error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   DELETE PRICING RULE
   ============================================================ */
const deletePricingRule = async (req, res) => {
  try {
    const { id } = req.params;
    const hall_id = req.user.hall_id;

    // Role check
    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      return res.status(403).json({ message: "Forbidden: Owner or manager permissions required" });
    }

    const { data, error } = await supabaseAdmin
      .from("venue_pricing_rules")
      .delete()
      .eq("id", id)
      .eq("hall_id", hall_id)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "Pricing rule not found" });

    res.json({ message: "Pricing rule deleted successfully", rule_name: data.rule_name });
  } catch (err) {
    console.error("deletePricingRule error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule
};
