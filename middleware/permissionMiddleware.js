/**
 * Permission-based access control middleware.
 * If user is owner or super_admin, they bypass the check.
 * If user is manager or staff, they must have the required permission.
 * Usage: permissionMiddleware("delete_bookings")
 */
module.exports = function (requiredPermission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { role, permissions } = req.user;

    // Bypass check for owner and super_admin
    if (role === "owner" || role === "super_admin") {
      return next();
    }

    // Check if user has the required permission
    if (Array.isArray(permissions) && permissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Missing permission: ${requiredPermission}`,
    });
  };
};
