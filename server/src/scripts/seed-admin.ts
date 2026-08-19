/**
 * Creates (or repairs) the initial admin account.
 *
 * Usage:
 *   npm run seed:admin -- <email> <password> [firstName] [lastName]
 *   npm run seed:admin            (uses the defaults below)
 */
import { connectDatabase, disconnectDatabase } from "../config/db";
import { env } from "../config/env";
import { User, UserRole } from "../models/user.model";

const [, , emailArg, passwordArg, firstNameArg, lastNameArg] = process.argv;

const email = (emailArg ?? "admin@tulip-tech.com").toLowerCase().trim();
const password = passwordArg ?? "ChangeMe-Admin1";
const firstName = firstNameArg ?? "EduNexa";
const lastName = lastNameArg ?? "Admin";

const seed = async (): Promise<void> => {
  await connectDatabase(env.MONGODB_URI);

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== UserRole.ADMIN || !existing.isActive) {
      existing.role = UserRole.ADMIN;
      existing.isActive = true;
      await existing.save();
      console.log(`[seed] Promoted existing user ${email} to active admin.`);
    } else {
      console.log(`[seed] Admin ${email} already exists — nothing to do.`);
    }
  } else {
    await User.create({ firstName, lastName, email, password, role: UserRole.ADMIN });
    console.log(`[seed] Created admin ${email}.`);
    console.log("[seed] Change this password after your first login.");
  }

  await disconnectDatabase();
};

seed().catch((error) => {
  console.error("[seed] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
