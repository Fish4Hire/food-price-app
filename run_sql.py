"""
Apply a SQL file to the Supabase database, instead of pasting it into the
Supabase SQL Editor by hand.

Uses SUPABASE_DB_URL from .env (the "Session pooler" connection string from
Supabase's Connect button, with your database password filled in). The whole
file runs in one transaction: if any statement fails, nothing is changed.

Run it with:  python run_sql.py             (applies schema.sql)
         or:  python run_sql.py other.sql
"""

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv


def main():
    load_dotenv()
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        sys.exit("Missing SUPABASE_DB_URL in your .env file.")

    path = Path(sys.argv[1] if len(sys.argv) > 1 else "schema.sql")
    sql = path.read_text(encoding="utf-8")

    with psycopg.connect(url, connect_timeout=15) as conn:
        conn.execute(sql)
        # Tell Supabase's API to notice new tables and columns right away.
        conn.execute("notify pgrst, 'reload schema'")
    print(f"Applied {path} successfully.")


if __name__ == "__main__":
    main()
