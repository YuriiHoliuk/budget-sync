# Budget Sync

Personal finance management tool for tracking spendings, income, capital, and budgeting.

## Features

- Sync transactions from Monobank API
- Store data in Google Spreadsheet
- Track expenses by categories
- Budget management

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Architecture**: Clean Architecture
- **DI**: TSyringe

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Configure environment variables in `.env`:
   ```
   MONOBANK_TOKEN=your_token
   SPREADSHEET_ID=your_spreadsheet_id
   GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
   ```

3. Add Google service account JSON file as `service-account.json`

4. Share your spreadsheet with the service account email

## Scripts

```bash
bun run start          # Run the app
bun run dev            # Run with watch mode
bun run test           # Run unit tests
bun run test:integration  # Run integration tests
bun run typecheck      # Type check
```

## Project Structure

```
src/
├── domain/           # Core business logic
├── application/      # Use cases
├── infrastructure/   # External implementations
├── modules/          # Reusable utilities
└── presentation/     # CLI/HTTP entry points
```
