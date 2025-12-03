const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} = require('discord.js');

const sodium = require("libsodium-wrappers");


const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior
} = require('@discordjs/voice');

const play = require('play-dl');
const fs = require('fs');
const config = require('./Jsns/config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

let prefix = config.prefix || '!';
const guildQueues = new Map();
const stats = {
  songsPlayed: 0,
  startedAt: Date.now()
};

function getQueue(guildId) {
  if (!guildQueues.has(guildId)) {
    guildQueues.set(guildId, {
      queue: [],
      player: createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause
        }
      }),
      connection: null,
      playing: false
    });
  }
  return guildQueues.get(guildId);
}

async function playNext(guildId) {
  const data = getQueue(guildId);
  const { queue, player, connection } = data;

  if (!connection || queue.length === 0) {
    data.playing = false;
    return;
  }

  const track = queue.shift();
  data.playing = true;

  try {
    const stream = await play.stream(track.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    player.play(resource);
    stats.songsPlayed++;

    player.once(AudioPlayerStatus.Idle, () => {
      setTimeout(() => playNext(guildId), 200);
    });

  } catch (err) {
    console.error("Fehler beim Abspielen:", err);
    playNext(guildId);
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

client.once('ready', () => {
  console.log(`Bot eingeloggt als ${client.user.tag}`);
  client.user.setActivity('Musik 🎶', { type: 2 });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'play') {
    const url = args[0];

    if (!url) return message.reply(`Gib eine URL an! Beispiel:\n\`${prefix}play https://...\``);

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('Du musst in einem Voice-Channel sein ❗');

    const q = getQueue(message.guild.id);

    try {
      const info = await play.video_info(url);
      const title = info.video_details.title;

      q.queue.push({
        url,
        title,
        requestedBy: message.author.tag
      });

      if (!q.connection) {
        q.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator
        });

        q.connection.subscribe(q.player);
      }

      message.channel.send(`🎶 **${title}** wurde zur Queue hinzugefügt!`);

      if (!q.playing) {
        playNext(message.guild.id);
      }

    } catch (err) {
      console.error(err);
      message.reply('❗ Fehler beim Verarbeiten des Songs.');
    }
  }

  else if (cmd === 'stop') {
    const q = getQueue(message.guild.id);
    q.queue = [];
    q.player.stop(true);
    message.channel.send('⏹️ Wiedergabe gestoppt.');
  }

  else if (cmd === 'skip') {
    const q = getQueue(message.guild.id);
    q.player.stop();
    message.channel.send('⏭️ Song übersprungen.');
  }

  else if (cmd === 'pause') {
    const q = getQueue(message.guild.id);
    q.player.pause();
    message.channel.send('⏸️ Pause.');
  }

  else if (cmd === 'resume') {
    const q = getQueue(message.guild.id);
    q.player.unpause();
    message.channel.send('▶️ Weiter geht‘s.');
  }

  else if (cmd === 'queue') {
    const q = getQueue(message.guild.id);

    if (q.queue.length === 0) return message.reply('Queue ist leer.');

    const list = q.queue.map((track, i) => `\`${i + 1}.\` ${track.title}`).join('\n');

    message.channel.send(`📜 **Queue:**\n${list}`);
  }

  else if (cmd === 'help') {
    message.channel.send(`
🎵 **Rhythmo Musik Bot — Commands**

\`${prefix}play [URL]\`
\`${prefix}skip\`
\`${prefix}stop\`
\`${prefix}queue\`
\`${prefix}pause\`
\`${prefix}resume\`
\`${prefix}stats\`
\`${prefix}dashboard\`
\`${prefix}prefix\`

Node 22 kompatibel ✔
`);
  }
});

client.login(config.token);
