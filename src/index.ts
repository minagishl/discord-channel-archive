import {
	Client,
	Events,
	GatewayIntentBits,
	TextChannel,
	Attachment,
	Message,
	Collection,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

const GUILD_ID = process.env.GUILD_ID;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const ARCHIVE_CHANNEL_ID = process.env.ARCHIVE_CHANNEL_ID;

// Create archive directory if it doesn't exist
const archiveDir = path.join(__dirname, '../archives');
const attachmentsDir = path.join(archiveDir, 'attachments');

// Remove existing archives directory if it exists
if (fs.existsSync(archiveDir)) {
	fs.rmSync(archiveDir, { recursive: true, force: true });
}

// Create fresh directories
fs.mkdirSync(archiveDir, { recursive: true });
fs.mkdirSync(attachmentsDir, { recursive: true });

const startTime = Date.now();

function formatElapsedTime(): string {
	const elapsed = Date.now() - startTime;
	const seconds = Math.floor(elapsed / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	} else {
		return `${seconds}s`;
	}
}

// Function to download and save attachment
async function downloadAttachment(attachment: Attachment): Promise<string> {
	const fileName = `${attachment.id}_${attachment.name}`;
	const filePath = path.join(attachmentsDir, fileName);

	if (!fs.existsSync(filePath)) {
		const response = await axios({
			method: 'GET',
			url: attachment.url,
			responseType: 'stream',
		});

		const writer = fs.createWriteStream(filePath);
		response.data.pipe(writer);

		await new Promise<void>((resolve, reject) => {
			writer.on('finish', () => resolve());
			writer.on('error', reject);
		});
	}

	return fileName;
}

// Function to save message data
async function saveMessageData(message: Message, messages: any[]) {
	const attachments = await Promise.all(
		Array.from(message.attachments.values()).map(async (attachment: Attachment) => {
			const fileName = await downloadAttachment(attachment);
			return {
				id: attachment.id,
				name: attachment.name,
				fileName: fileName,
				contentType: attachment.contentType,
				size: attachment.size,
			};
		})
	);

	const messageData = {
		id: message.id,
		content: message.content,
		author: {
			id: message.author.id,
			username: message.author.username,
			tag: message.author.tag,
		},
		timestamp: message.createdAt,
		attachments: attachments,
	};

	messages.push(messageData);
}

// Function to create and send zip archive
async function createAndSendZipArchive(channel: TextChannel, messages: any[]) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const zipPath = path.join(archiveDir, `archive_${timestamp}.zip`);
	const output = fs.createWriteStream(zipPath);
	const archive = archiver('zip', { zlib: { level: 9 } });

	// Save all messages to a single JSON file
	const messagesFilePath = path.join(archiveDir, 'messages.json');
	fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));

	output.on('close', async () => {
		const archiveChannel = ARCHIVE_CHANNEL_ID
			? ((await channel.guild.channels.fetch(ARCHIVE_CHANNEL_ID)) as TextChannel)
			: channel;

		if (archiveChannel) {
			try {
				await archiveChannel.send({
					content: `Archive created at ${timestamp}`,
					files: [zipPath],
				});
			} catch (error) {
				if (error instanceof Error && 'code' in error && error.code === 40005) {
					process.exit(1);
				}
				throw error;
			}
		}

		// Clean up the zip file after sending
		fs.unlinkSync(zipPath);
		fs.unlinkSync(messagesFilePath);
	});

	archive.pipe(output);

	// Add messages.json file
	archive.file(messagesFilePath, { name: 'messages.json' });

	// Add attachments directory
	archive.directory(attachmentsDir, 'attachments');

	await archive.finalize();
}

// Function to fetch and save historical messages
async function fetchAndSaveHistoricalMessages(channel: TextChannel) {
	console.log('Fetching historical messages...');
	let lastId: string | undefined;
	let messageCount = 0;
	const messages: any[] = [];

	while (true) {
		const options: any = { limit: 100 };
		if (lastId) {
			options.before = lastId;
		}

		const fetchedMessages = (await channel.messages.fetch(options)) as unknown as Collection<
			string,
			Message
		>;
		if (fetchedMessages.size === 0) break;

		for (const message of fetchedMessages.values()) {
			await saveMessageData(message, messages);
			messageCount++;
		}

		const lastMessage = fetchedMessages.last();
		if (!lastMessage) break;
		lastId = lastMessage.id;
		console.log(`Processed ${messageCount} messages so far...`);

		// Update status
		client.user?.setPresence({
			activities: [{ name: `Archiving Messages (${messageCount})`, type: 0 }],
			status: 'online',
		});
	}

	console.log(`Finished archiving ${messageCount} messages`);

	// Create and send zip archive after fetching all messages
	await createAndSendZipArchive(channel, messages);

	console.log('Completed');
	process.exit(0);
}

client.once(Events.ClientReady, async () => {
	console.log('Bot is ready!');

	if (!TARGET_CHANNEL_ID) {
		console.error('TARGET_CHANNEL_ID is not set in environment variables');
		return;
	}

	const channel = (await client.channels.fetch(TARGET_CHANNEL_ID)) as TextChannel;
	if (channel) {
		await fetchAndSaveHistoricalMessages(channel);
	}

	client.user?.setPresence({
		activities: [{ name: 'Channel Archive', type: 0 }],
		status: 'online',
	});

	// Update status every 10 seconds
	setInterval(() => {
		client.user?.setPresence({
			activities: [{ name: `Channel Archive (${formatElapsedTime()})`, type: 0 }],
			status: 'online',
		});
	}, 10000);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.guildId !== GUILD_ID || message.channelId !== TARGET_CHANNEL_ID) return;

	try {
		const messages: any[] = [];
		await saveMessageData(message, messages);
		await createAndSendZipArchive(message.channel as TextChannel, messages);
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 40005) {
			process.exit(1);
		}
		console.error('Error processing message:', error);
		client.user?.setPresence({
			activities: [{ name: `Error Occurred (${formatElapsedTime()})`, type: 0 }],
			status: 'dnd',
		});
	}
});

client.login(process.env.DISCORD_TOKEN);
