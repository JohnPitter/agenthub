DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'language'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "language" text DEFAULT 'pt-BR';
  END IF;
END $$;
