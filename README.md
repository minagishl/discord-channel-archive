# Discord Channel Archive

A Discord bot that archives messages and attachments from channels into ZIP files, preserving both historical and real-time content in an organized format.

## Features

- Archive all messages from a specified Discord channel
- Download and save all attachments from messages
- Create a ZIP archive containing:
  - All messages in JSON format
  - All attachments with original filenames
- Send the archive to a specified channel or the same channel
- Progress tracking with elapsed time display

## Setup

1. Clone the repository

```bash
git clone https://github.com/minagishl/discord-channel-archive.git
cd discord-channel-archive
```

2. Install dependencies

```bash
pnpm install
```

3. Configure environment variables
   Copy `.env.example` to `.env` and set the required information:

```bash
cp .env.example .env
```

Set the following environment variables:

- `DISCORD_TOKEN`: Discord Bot token
- `GUILD_ID`: Target server ID
- `TARGET_CHANNEL_ID`: Channel ID to archive
- `ARCHIVE_CHANNEL_ID`: (Optional) Channel ID to send archives to

## Usage

Run in development mode:

```bash
pnpm dev
```

Run in production mode:

```bash
pnpm start
```

## Notes

- The bot requires the following Discord permissions:
  - Read Messages/View Channels
  - Send Messages
  - Attach Files
  - Read Message History
- The archive is created in the `archives` directory and then sent as a ZIP file
- Each archive includes a timestamp in its filename
- The bot will automatically clean up temporary files after sending the archive
- If the archive file is too large for Discord's file size limit, the bot will exit with an error
