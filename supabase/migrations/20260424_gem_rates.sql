CREATE TABLE IF NOT EXISTS gem_rates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card       text        NOT NULL,
  sport      text        NOT NULL CHECK (sport IN ('football', 'basketball')),
  gem_rate   numeric(5,4) NOT NULL CHECK (gem_rate >= 0 AND gem_rate <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gem_rates_card_sport_idx ON gem_rates (card, sport);

GRANT SELECT ON gem_rates TO authenticated;
GRANT SELECT ON gem_rates TO anon;
