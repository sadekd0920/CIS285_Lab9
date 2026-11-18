# SplitSmart Prototype (CIS 285 Lab 9)

A Next.js + Prisma (SQLite) web app for splitting shared group expenses.

## Setup and run

```bash
cd prototype
npm install                                     # if node_modules is missing
echo 'DATABASE_URL="file:./dev.db"' > .env      # local SQLite file (prisma/dev.db)
npx prisma migrate dev                          # create/upgrade the database
npm run dev                                     # http://localhost:3000
```

## Tests

```bash
npm test                         # unit tests (money parsing, splitting, balances)
node scripts/api-test.mjs        # end-to-end API test; needs `npm run dev` running
```

To reset the database: `npx prisma migrate reset`.

See [LAB9_REPORT.md](./LAB9_REPORT.md) for the full report.
