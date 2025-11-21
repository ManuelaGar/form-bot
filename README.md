# Form Filling Bot

A TypeScript-based automation bot that fills out Microsoft Forms for multiple users using Puppeteer.

## Features

*   **Automated Form Filling**: Automatically fills text inputs, radio buttons, and rating scales.
*   **Database Driven**: Reads user data from a local `database.json` file.
*   **Robust Selectors**: Uses `data-automation-id` and label matching to reliably find fields, supporting both English and Spanish form locales.
*   **Configurable**: Uses environment variables for form URL and browser settings.
*   **Error Handling**: Captures screenshots on errors for easy debugging.

## Prerequisites

*   Node.js (v14 or higher)
*   npm

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/ManuelaGar/form-bot.git
    cd form-bot
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

1.  **Environment Variables**:
    Create a `.env` file in the root directory (copy from `.env.example` if available, or use the template below):
    ```env
    FORM_URL=https://forms.office.com/r/1js0zLgnP5
    HEADLESS=false
    ```
    *   `FORM_URL`: The URL of the Microsoft Form to fill.
    *   `HEADLESS`: Set to `true` to run the browser in the background, or `false` to see the automation in action.

2.  **User Database**:
    Edit `database.json` to add the users you want to process. The file should contain an array of person objects:
    ```json
    [
      {
        "fullName": "John Doe",
        "documentType": "Cedula de ciudadanía",
        "documentNumber": "123456789",
        "email": "john@example.com",
        "jobTitle": "Developer",
        "companyNit": "900123456",
        "companyName": "Tech Corp",
        "department": "Antioquia",
        "phoneNumber": "3001234567",
        "isDeaf": "No",
        "ratings": {
          "facilitator": 5,
          "trainingUtility": 5,
          "tools": 5,
          "arlSatisfaction": 5,
          "trainingSatisfaction": 5,
          "difficulty": 5,
          "recommendation": 10
        }
      }
    ]
    ```

## Usage

To start the bot, run:

```bash
npm start
```

The bot will launch a browser instance for each user in the database, fill out the form, submit it, and log the progress to the console.

## Troubleshooting

*   **Timeouts**: If the bot times out waiting for the form to load or submit, check your internet connection. You can also adjust the timeout values in `src/index.ts`.
*   **Selectors**: If the form structure changes, the bot might fail to find fields. Check the `error-*.png` screenshots generated in the root directory to identify the issue.
