-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "user_name" DROP NOT NULL,
ALTER COLUMN "user_age" DROP NOT NULL,
ALTER COLUMN "user_family_context" DROP NOT NULL,
ALTER COLUMN "user_location" DROP NOT NULL,
ALTER COLUMN "user_professional_moment" DROP NOT NULL,
ALTER COLUMN "user_trigger" DROP NOT NULL;
