# Monobank Open API Documentation

> **Base URL:** `https://api.monobank.ua`
> **API Version:** v250818
> **Official Docs:** https://api.monobank.ua/docs/index.html

## Authentication

All personal endpoints require an `X-Token` header for authentication.

### Getting Your Token

1. Go to https://api.monobank.ua/
2. Authorize with your Monobank account
3. Obtain your personal access token

### Using the Token

```http
X-Token: your_personal_token_here
```

**Example:**
```bash
curl -H "X-Token: u3AulkpZFI1lIuGsik6vuPsVWqN7GoWs6o_MO2sdf301" \
     https://api.monobank.ua/personal/client-info
```

## Rate Limits

| Endpoint | Rate Limit |
|----------|------------|
| `/bank/currency` | Cached, updates every 5 minutes |
| `/personal/client-info` | 1 request per 60 seconds |
| `/personal/statement/{account}/{from}/{to}` | 1 request per 60 seconds |

## Endpoints

### Public Endpoints (No Authentication Required)

#### GET /bank/currency

Get currency exchange rates.

**Response:** `application/json`

```json
[
  {
    "currencyCodeA": 840,
    "currencyCodeB": 980,
    "date": 1552392228,
    "rateSell": 27,
    "rateBuy": 27.2,
    "rateCross": 27.1
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `currencyCodeA` | int32 | Currency code (ISO 4217) |
| `currencyCodeB` | int32 | Currency code (ISO 4217) |
| `date` | int64 | Rate timestamp (Unix time, seconds) |
| `rateSell` | float | Sell rate |
| `rateBuy` | float | Buy rate |
| `rateCross` | float | Cross rate |

---

### Personal Endpoints (Authentication Required)

#### GET /personal/client-info

Get client information including accounts and jars.

**Headers:**
- `X-Token` (required): Personal access token

**Response:** `application/json`

```json
{
  "clientId": "3MSaMMtczs",
  "name": "John Doe",
  "webHookUrl": "https://example.com/webhook",
  "permissions": "psfj",
  "accounts": [...],
  "jars": [...]
}
```

**Client Info Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | string | Client identifier (same as send.monobank.ua ID) |
| `name` | string | Client name |
| `webHookUrl` | string | Webhook URL for balance change events |
| `permissions` | string | Service permissions (1 letter per permission) |
| `accounts` | array | List of accounts |
| `jars` | array | List of jars (savings goals) |

**Account Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Account identifier |
| `sendId` | string | Identifier for send.monobank.ua/{sendId} |
| `balance` | int64 | Balance in minor currency units (kopecks, cents) |
| `creditLimit` | int64 | Credit limit |
| `type` | string | Account type: `black`, `white`, `platinum`, `iron`, `fop`, `yellow`, `eAid` |
| `currencyCode` | int32 | Currency code (ISO 4217) |
| `cashbackType` | string | Cashback type: `None`, `UAH`, `Miles` |
| `maskedPan` | array | Masked card numbers |
| `iban` | string | Account IBAN |

**Jar Object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Jar identifier |
| `sendId` | string | Identifier for send.monobank.ua/{sendId} |
| `title` | string | Jar name |
| `description` | string | Jar description |
| `currencyCode` | int32 | Currency code (ISO 4217) |
| `balance` | int64 | Balance in minor currency units |
| `goal` | int64 | Target amount in minor currency units |

---

#### GET /personal/statement/{account}/{from}/{to}

Get account statement (transaction history).

**Path Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `account` | Yes | Account ID from client-info, or `0` for default account |
| `from` | Yes | Start time (Unix timestamp in seconds) |
| `to` | No | End time (Unix timestamp). Defaults to current time |

**Headers:**
- `X-Token` (required): Personal access token

**Constraints:**
- Maximum time range: 31 days + 1 hour (2,682,000 seconds)
- Rate limit: 1 request per 60 seconds

**Example:**
```bash
curl -H "X-Token: your_token" \
     "https://api.monobank.ua/personal/statement/0/1546304461/1546306461"
```

**Response:** `application/json`

```json
[
  {
    "id": "ZuHWzqkKGVo=",
    "time": 1554466347,
    "description": "Coffee Shop",
    "mcc": 7997,
    "originalMcc": 7997,
    "hold": false,
    "amount": -95000,
    "operationAmount": -95000,
    "currencyCode": 980,
    "commissionRate": 0,
    "cashbackAmount": 19000,
    "balance": 10050000,
    "comment": "For coffee",
    "receiptId": "XXXX-XXXX-XXXX-XXXX",
    "invoiceId": "2103.v.27",
    "counterEdrpou": "3096889974",
    "counterIban": "UA898999980000355639201001404",
    "counterName": "COMPANY NAME"
  }
]
```

**Statement Item Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique transaction ID |
| `time` | int64 | Transaction time (Unix timestamp, seconds) |
| `description` | string | Transaction description |
| `mcc` | int32 | Merchant Category Code (ISO 18245) |
| `originalMcc` | int32 | Original MCC |
| `hold` | boolean | Authorization hold status |
| `amount` | int64 | Amount in account currency (minor units) |
| `operationAmount` | int64 | Amount in transaction currency (minor units) |
| `currencyCode` | int32 | Currency code (ISO 4217) |
| `commissionRate` | int64 | Commission in minor units |
| `cashbackAmount` | int64 | Cashback in minor units |
| `balance` | int64 | Account balance after transaction |
| `comment` | string | User comment (optional, may be absent) |
| `receiptId` | string | Receipt number for check.gov.ua (optional) |
| `invoiceId` | string | FOP invoice number (optional) |
| `counterEdrpou` | string | Counterparty EDRPOU (FOP accounts only) |
| `counterIban` | string | Counterparty IBAN (FOP accounts only) |
| `counterName` | string | Counterparty name |

---

#### POST /personal/webhook

Set up a webhook URL to receive transaction notifications.

**Headers:**
- `X-Token` (required): Personal access token

**Request Body:** `application/json`

```json
{
  "webHookUrl": "https://example.com/webhook"
}
```

**Webhook Behavior:**

1. **Validation:** A GET request is sent to verify the URL. Server must respond with HTTP 200.
2. **Events:** POST requests are sent with transaction data:

```json
{
  "type": "StatementItem",
  "data": {
    "account": "account_id",
    "statementItem": { /* StatementItem object */ }
  }
}
```

3. **Retry Policy:**
   - Initial attempt
   - Retry after 60 seconds if no response within 5 seconds
   - Final retry after 600 seconds
   - Webhook disabled if third attempt fails

4. **Response Requirement:** Your server must return HTTP 200.

---

## Common Currency Codes (ISO 4217)

| Code | Currency |
|------|----------|
| 980 | UAH (Ukrainian Hryvnia) |
| 840 | USD (US Dollar) |
| 978 | EUR (Euro) |
| 826 | GBP (British Pound) |
| 985 | PLN (Polish Zloty) |

## Important Notes

1. **Minor Currency Units:** All monetary values are in the smallest currency unit (kopecks for UAH, cents for USD/EUR). Divide by 100 to get the actual amount.

2. **Negative Amounts:** Expenses are represented as negative values.

3. **Age Restriction:** API is not available for clients under 16 years old. Child account data is accessible from parent accounts.

4. **Corporate Use:** If you're building a service for third-party users where their data passes through your servers, you must use the [Corporate API](https://api.monobank.ua/docs/corporate.html).

5. **Personal Use Only:** This API is for personal use, family applications, or libraries where client data doesn't pass through developer nodes.

6. **Community Support:** Join the [Telegram group](https://t.me/joinchat/FiAEWhDf-QzTqM4wzEtffw) for API questions.

## Code Examples

### JavaScript/Node.js

```javascript
const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN;
const BASE_URL = 'https://api.monobank.ua';

// Get client info
async function getClientInfo() {
  const response = await fetch(`${BASE_URL}/personal/client-info`, {
    headers: { 'X-Token': MONOBANK_TOKEN }
  });
  return response.json();
}

// Get statement for last 30 days
async function getStatement(accountId = '0') {
  const to = Math.floor(Date.now() / 1000);
  const from = to - (30 * 24 * 60 * 60); // 30 days ago

  const response = await fetch(
    `${BASE_URL}/personal/statement/${accountId}/${from}/${to}`,
    { headers: { 'X-Token': MONOBANK_TOKEN } }
  );
  return response.json();
}

// Get currency rates (no auth required)
async function getCurrencyRates() {
  const response = await fetch(`${BASE_URL}/bank/currency`);
  return response.json();
}
```

### Python

```python
import requests
import time
import os

MONOBANK_TOKEN = os.environ.get('MONOBANK_TOKEN')
BASE_URL = 'https://api.monobank.ua'

headers = {'X-Token': MONOBANK_TOKEN}

# Get client info
def get_client_info():
    response = requests.get(f'{BASE_URL}/personal/client-info', headers=headers)
    return response.json()

# Get statement for last 30 days
def get_statement(account_id='0'):
    to_time = int(time.time())
    from_time = to_time - (30 * 24 * 60 * 60)  # 30 days ago

    response = requests.get(
        f'{BASE_URL}/personal/statement/{account_id}/{from_time}/{to_time}',
        headers=headers
    )
    return response.json()

# Get currency rates (no auth required)
def get_currency_rates():
    response = requests.get(f'{BASE_URL}/bank/currency')
    return response.json()
```

### cURL

```bash
# Get currency rates
curl https://api.monobank.ua/bank/currency

# Get client info
curl -H "X-Token: YOUR_TOKEN" https://api.monobank.ua/personal/client-info

# Get statement (last 30 days for default account)
FROM=$(date -v-30d +%s)  # macOS
TO=$(date +%s)
curl -H "X-Token: YOUR_TOKEN" \
     "https://api.monobank.ua/personal/statement/0/${FROM}/${TO}"

# Set webhook
curl -X POST \
     -H "X-Token: YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"webHookUrl": "https://your-server.com/webhook"}' \
     https://api.monobank.ua/personal/webhook
```
