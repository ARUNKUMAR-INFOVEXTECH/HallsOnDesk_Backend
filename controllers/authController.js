const { supabase, supabaseAdmin } = require("../config/supabase");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* ============================================================
   LOGIN
   Uses Supabase Auth — returns a Supabase JWT.
   This token is used for all subsequent API calls AND
   for direct Supabase client calls (RLS uses this token).
   ============================================================ */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ message: error.message });
    }

    const authUserId = data.user.id;

    // Check if super_admin
    const { data: admin } = await supabaseAdmin
      .from("super_admins")
      .select("id, name, email")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (admin) {
      return res.json({
        message: "Login successful",
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        role: "super_admin",
        user: { ...admin, role: "super_admin" },
      });
    }

    // Regular user
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, name, email, role, hall_id, multi_hall_enabled, different_staff_management, status, permissions")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    // Fetch accessible halls list
    const { data: userHalls } = await supabaseAdmin
      .from("user_halls")
      .select("marriage_halls ( id, hall_name )")
      .eq("user_id", user.id);

    const accessibleHalls = (userHalls || [])
      .map((h) => h.marriage_halls)
      .filter(Boolean);

    return res.json({
      message: "Login successful",
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      role: user.role,
      user: {
        ...user,
        accessible_halls: accessibleHalls,
      },
    });
  } catch (err) {
    console.error("loginUser error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   REFRESH TOKEN
   ============================================================ */
const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ message: "refresh_token is required" });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return res.status(401).json({ message: error.message });
    }

    res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   GET PROFILE
   Returns the decoded user from authMiddleware
   ============================================================ */
const getProfile = async (req, res) => {
  try {
    if (req.user.role === "super_admin") {
      return res.json({
        message: "Profile fetched successfully",
        user: {
          ...req.user,
          accessible_halls: [],
        },
      });
    }

    const { data: userHalls } = await supabaseAdmin
      .from("user_halls")
      .select("marriage_halls ( id, hall_name )")
      .eq("user_id", req.user.id);

    const accessibleHalls = (userHalls || [])
      .map((h) => h.marriage_halls)
      .filter(Boolean);

    res.json({
      message: "Profile fetched successfully",
      user: {
        ...req.user,
        accessible_halls: accessibleHalls,
      },
    });
  } catch (err) {
    console.error("getProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================================================
   CREATE SUPER ADMIN (one-time bootstrap)
   Protected by a secret key in the request body.
   Run once to create the first super admin.
   ============================================================ */
const createSuperAdmin = async (req, res) => {
  try {
    const { name, email, password, bootstrap_secret } = req.body;

    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Bootstrap super admin creation is disabled in production environment" });
    }

    // Protect this endpoint with a secret set in .env
    if (bootstrap_secret !== process.env.BOOTSTRAP_SECRET) {
      return res.status(403).json({ message: "Invalid bootstrap secret" });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // auto-confirm super admin
      });

    if (authError) {
      return res.status(400).json({ message: authError.message });
    }

    // Hash password for super_admins table (table has NOT NULL constraint)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store in super_admins table
    const { data, error } = await supabaseAdmin
      .from("super_admins")
      .insert([{ name, email, password: hashedPassword, auth_user_id: authData.user.id }])
      .select("id, name, email")
      .single();

    if (error) {
      // Rollback auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ message: error.message });
    }

    res.status(201).json({
      message: "Super admin created successfully",
      data,
    });
  } catch (err) {
    console.error("createSuperAdmin error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Verify user exists first
    const { data: userProfile } = await supabaseAdmin
      .from("users")
      .select("id, name")
      .eq("email", email)
      .maybeSingle();

    const { data: adminProfile } = await supabaseAdmin
      .from("super_admins")
      .select("id, name")
      .eq("email", email)
      .maybeSingle();

    if (!userProfile && !adminProfile) {
      return res.status(400).json({ message: "No account found with this email address." });
    }

    const userName = userProfile?.name || adminProfile?.name || "User";

    // Determine dynamic redirectTo URL based on origin/referer headers
    let origin = req.headers.origin || req.headers.referer || "https://infovexhalls.vercel.app";
    try {
      const urlObj = new URL(origin);
      origin = `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
      // Fallback
    }
    const redirectTo = `${origin.replace(/\/$/, "")}/reset-password`;

    let emailSent = false;
    let emailError = null;

    // 1. Attempt to send via Supabase native SMTP first
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (!error) {
        emailSent = true;
      } else {
        emailError = error.message;
      }
    } catch (err) {
      emailError = err.message;
    }

    // 2. Fallback: If native SMTP fails, generate recovery link programmatically and send via Resend directly
    let actionLink = null;
    if (!emailSent) {
      console.warn("Supabase native reset email failed. Generating recovery link programmatically...");
      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: email,
          options: {
            redirectTo,
          }
        });

        if (!linkError && linkData?.properties?.action_link) {
          actionLink = linkData.properties.action_link;

          // If RESEND_API_KEY is configured in env, send via direct Resend API call
          if (process.env.RESEND_API_KEY) {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM || "Infovex Halls <onboarding@resend.dev>",
                to: email,
                subject: "Reset Your Password - Infovex Halls",
                html: `
                  <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <div style="border-bottom: 1px solid #edf2f7; padding-bottom: 20px; margin-bottom: 24px; text-align: center;">
                      <img src="https://hallsondesk.vercel.app/logo.png" alt="Infovex Halls" style="height: 40px; border-radius: 8px;"/>
                    </div>
                    <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 16px; text-align: center;">Reset Your Password</h2>
                    <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hello ${userName},</p>
                    <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">We received a request to reset the password for your account. Click the button below to proceed and set a new password:</p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${actionLink}" style="display: inline-block; padding: 12px 24px; background-color: #062089; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 6px -1px rgba(6, 32, 137, 0.2);">Reset Password</a>
                    </div>
                    <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin-top: 24px; margin-bottom: 8px;">If the button doesn't work, you can copy and paste the link below into your browser:</p>
                    <p style="color: #062089; font-size: 12px; word-break: break-all; font-family: monospace; background-color: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 0 0 24px 0;">${actionLink}</p>
                    <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">If you did not request this password reset, please ignore this email.</p>
                    <div style="border-top: 1px solid #edf2f7; padding-top: 20px; margin-top: 32px; text-align: center; color: #94a3b8; font-size: 11px;">
                      <p style="margin: 0 0 4px 0;">© 2026 Infovex Halls. All rights reserved.</p>
                      <p style="margin: 0;">Powered by Infovex Technologies Private Limited.</p>
                    </div>
                  </div>
                `
              }),
            });

            if (resendRes.ok) {
              emailSent = true;
              console.log(`Password reset email successfully sent to ${email} via Resend direct API.`);
            } else {
              const errData = await resendRes.json();
              console.error("Direct Resend email dispatch failed:", errData);
              emailError = errData.message || JSON.stringify(errData);
            }
          }
        } else {
          console.error("generateLink error:", linkError);
          emailError = linkError?.message || "Failed to generate recovery link";
        }
      } catch (err) {
        console.error("Error during fallback link generation:", err.message);
        emailError = err.message;
      }
    }

    if (emailSent) {
      return res.json({ message: "Password reset link sent to your email." });
    }

    // 3. Dev Mode Bypass: If email delivery failed completely, but we have the link, return it in development
    if (actionLink && process.env.NODE_ENV !== "production") {
      console.log(`[DEVELOPMENT ONLY] Recovery link generated for ${email}: ${actionLink}`);
      return res.json({
        message: "Password reset email delivery failed (SMTP authentication invalid). Link generated for local testing.",
        link: actionLink,
      });
    }

    return res.status(500).json({
      message: "Failed to send password reset email. Please contact administrator.",
      error: emailError || "SMTP delivery failed",
    });
  } catch (err) {
    console.error("forgotPassword exception:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    // Decode and verify the JWT access token using the Supabase JWT secret
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT token verification failed:", err.message);
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const userId = decoded.sub; // sub is the auth user ID

    // Update user password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: password,
    });

    if (updateError) {
      console.error("updateUserById error:", updateError.message);
      return res.status(400).json({ message: updateError.message });
    }

    // Update password backup in users table
    const cryptoHelper = require("../utils/cryptoHelper");
    const backup_password_enc = cryptoHelper.encrypt(password);
    await supabaseAdmin
      .from("users")
      .update({ backup_password_enc })
      .eq("auth_user_id", userId);

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("resetPassword exception:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
    }

    // 1. Verify current password by signing in with user's email
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword,
    });

    if (signInError) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // 2. Determine the user's Auth ID in Supabase
    let authUserId = req.user.auth_user_id;

    if (!authUserId) {
      // Fallback: list users via admin client to find by email
      const { data: authUserList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && authUserList?.users) {
        const found = authUserList.users.find(u => u.email === req.user.email);
        if (found) {
          authUserId = found.id;
        }
      }
    }

    if (!authUserId) {
      return res.status(400).json({ message: "Authentication user identity not found" });
    }

    // 3. Update password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(400).json({ message: updateError.message });
    }

    // 4. Update password backup in super_admins table if role is super_admin
    if (req.user.role === "super_admin") {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await supabaseAdmin
        .from("super_admins")
        .update({ password: hashedPassword })
        .eq("email", req.user.email);
    }

    // 5. Update password backup in users table
    const cryptoHelper = require("../utils/cryptoHelper");
    const backup_password_enc = cryptoHelper.encrypt(newPassword);
    await supabaseAdmin
      .from("users")
      .update({ backup_password_enc })
      .eq("email", req.user.email);

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  loginUser,
  refreshToken,
  getProfile,
  createSuperAdmin,
  forgotPassword,
  resetPassword,
  changePassword,
};