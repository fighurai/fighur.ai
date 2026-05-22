export type Role = "user" | "admin" | "viewer";

export type Permission =
  | "chat:use"
  | "connect:manage"
  | "data:read_own"
  | "data:write_own"
  | "audit:read_own"
  | "admin:users"
  | "admin:audit";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: ["chat:use", "connect:manage", "data:read_own", "data:write_own", "audit:read_own"],
  viewer: ["chat:use", "data:read_own", "audit:read_own"],
  admin: [
    "chat:use",
    "connect:manage",
    "data:read_own",
    "data:write_own",
    "audit:read_own",
    "admin:users",
    "admin:audit",
  ],
};

export function normalizeRoles(roles: unknown): Role[] {
  if (!Array.isArray(roles)) return ["user"];
  const valid = roles.filter((r): r is Role => r === "user" || r === "admin" || r === "viewer");
  return valid.length > 0 ? valid : ["user"];
}

export function permissionsForRoles(roles: Role[], extra?: Permission[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  }
  if (extra) for (const p of extra) set.add(p);
  return set;
}

export function hasPermission(
  roles: Role[],
  permission: Permission,
  extra?: Permission[],
): boolean {
  const perms = permissionsForRoles(roles, extra);
  if (perms.has("admin:users") || perms.has("admin:audit")) return true;
  return perms.has(permission);
}
