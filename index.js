const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const fs = require("fs");
const path = require("path");
const config = require("./config.json");

// Prefix aus config
let prefix = config.prefix || "!";

// Stats
const stats = {
  startedAt: Date.now(),
  commandsRun: 0,
  songsPlayed: 0
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// DisTube ohne Sonderoptionen, nur Plugins → vermeidet INVALID_KEY-Fehler
const distube = new DisTube(client, {
  plugins: [
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YtDlpPlugin()
  ]
});

// ===== Helper =====
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function saveConfigPrefix(newPrefix) {
  try {
    const cfgPath = path.join(__dirname, "Jsns", "config.json");
    const newConfig = { ...config, prefix: newPrefix };
    fs.writeFileSync(cfgPath, JSON.stringify(newConfig, null, 2), "utf8");
  } catch (err) {
    console.error("Fehler beim Speichern von config.json:", err);
  }
}

// ===== Events =====

client.once("ready", () => {
  console.log(`🔥 Bot eingeloggt als ${client.user.tag}`);
  client.user.setActivity(`${prefix}play | Musik`, { type: 2 });
});

// DisTube Events für Stats & Feedback
distube.on("playSong", (queue, song) => {
  stats.songsPlayed++;
  queue.textChannel?.send(`▶️ **Jetzt läuft:** ${song.name} \`${song.formattedDuration}\``).catch(() => {});
});

distube.on("addSong", (queue, song) => {
  queue.textChannel?.send(`➕ **Zur Queue hinzugefügt:** ${song.name}`).catch(() => {});
});

distube.on("error", (channel, error) => {
  console.error("DisTube Fehler:", error);
  if (channel && channel.send) {
    channel.send("❗ Es ist ein Fehler beim Abspielen aufgetreten.").catch(() => {});
  }
});

// ===== Command Handler =====

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = (args.shift() || "").toLowerCase();

  stats.commandsRun++;

  const voice = message.member.voice.channel;

  // --- !play [URL / Text] ---
  if (cmd === "play") {
    if (!voice) {
      return message.reply("❗ Du musst in einem Voice-Channel sein, um Musik zu starten.");
    }
    const query = args.join(" ");
    if (!query) {
      return message.reply(`❗ Bitte gib einen Songnamen oder eine URL an.\nBeispiel: \`${prefix}play never gonna give you up\``);
    }

    try {
      await distube.play(voice, query, {
        member: message.member,
        textChannel: message.channel
      });
    } catch (err) {
      console.error("Fehler bei !play:", err);
      message.reply("❗ Beim Starten des Songs ist ein Fehler aufgetreten.");
    }
  }

  // --- !stop ---
  else if (cmd === "stop") {
    try {
      await distube.stop(message);
      message.channel.send("⏹️ Wiedergabe gestoppt und Queue geleert.");
    } catch {
      message.reply("Es läuft gerade keine Musik.");
    }
  }

  // --- !skip ---
  else if (cmd === "skip") {
    try {
      await distube.skip(message);
      message.channel.send("⏭️ Song übersprungen.");
    } catch {
      message.reply("Es gibt keinen nächsten Song in der Queue.");
    }
  }

  // --- !pause ---
  else if (cmd === "pause") {
    try {
      await distube.pause(message);
      message.channel.send("⏸️ Wiedergabe pausiert.");
    } catch {
      message.reply("Ich kann nichts pausieren, es läuft keine Musik.");
    }
  }

  // --- !resume ---
  else if (cmd === "resume") {
    try {
      await distube.resume(message);
      message.channel.send("▶️ Wiedergabe fortgesetzt.");
    } catch {
      message.reply("Es gibt nichts fortzusetzen.");
    }
  }

  // --- !queue ---
  else if (cmd === "queue") {
    const q = distube.getQueue(message);
    if (!q || !q.songs || q.songs.length === 0) {
      return message.channel.send("📭 Die Queue ist leer.");
    }

    const lines = q.songs
      .map((song, i) => `${i === 0 ? "🎶 **Jetzt:**" : `\`${i}.\``} ${song.name} \`${song.formattedDuration}\``)
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setTitle("📜 Aktuelle Queue")
      .setDescription(lines.join("\n"))
      .setColor(0x5865f2)
      .setFooter({ text: q.songs.length > 10 ? `+ ${q.songs.length - 10} weitere Songs...` : "Ende der Queue" });

    message.channel.send({ embeds: [embed] });
  }

  // --- !stats ---
  else if (cmd === "stats") {
    const uptime = Date.now() - stats.startedAt;

    const embed = new EmbedBuilder()
      .setTitle("📊 Bot-Statistiken")
      .setColor(0x57f287)
      .addFields(
        { name: "Server", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Befehle genutzt", value: `${stats.commandsRun}`, inline: true },
        { name: "Songs gespielt", value: `${stats.songsPlayed}`, inline: true },
        { name: "Uptime", value: formatDuration(uptime), inline: true }
      )
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }

  // --- !dashboard ---
  else if (cmd === "dashboard") {
    const q = distube.getQueue(message);
    const nowPlaying = q?.songs?.[0];

    const embed = new EmbedBuilder()
      .setTitle("🎛️ Rhythmo Dashboard")
      .setColor(0xf9a61a)
      .addFields(
        { name: "Prefix", value: `\`${prefix}\``, inline: true },
        { name: "Spielt gerade?", value: nowPlaying ? "Ja" : "Nein", inline: true },
        { name: "Songs in Queue", value: `${q?.songs?.length || 0}`, inline: true },
        { name: "Songs gespielt (seit Start)", value: `${stats.songsPlayed}`, inline: true }
      );

    if (nowPlaying) {
      embed.addFields({
        name: "Jetzt läuft",
        value: `${nowPlaying.name} \`${nowPlaying.formattedDuration}\``
      });
    }

    message.channel.send({ embeds: [embed] });
  }

  // --- !prefix [neu] ---
  else if (cmd === "prefix") {
    const newPrefix = args[0];

    if (!newPrefix) {
      return message.channel.send(`Aktueller Prefix ist: \`${prefix}\``);
    }

    if (newPrefix.length > 3) {
      return message.reply("Der Prefix darf maximal 3 Zeichen lang sein.");
    }

    prefix = newPrefix;
    saveConfigPrefix(newPrefix);

    message.channel.send(`✅ Neuer Prefix gesetzt: \`${prefix}\``);
  }

  // --- !help ---
  else if (cmd === "help") {
    const embed = new EmbedBuilder()
      .setTitle("❓ Rhythmo Hilfe")
      .setColor(0x3498db)
      .setDescription("Alle verfügbaren Befehle:")
      .addFields(
        { name: `${prefix}play [Text/URL]`, value: "Spielt Musik von YouTube / Spotify / SoundCloud.", inline: false },
        { name: `${prefix}stop`, value: "Stoppt die Wiedergabe und leert die Queue.", inline: false },
        { name: `${prefix}skip`, value: "Überspringt den aktuellen Song.", inline: false },
        { name: `${prefix}queue`, value: "Zeigt die aktuelle Queue.", inline: false },
        { name: `${prefix}pause`, value: "Pausiert die Wiedergabe.", inline: false },
        { name: `${prefix}resume`, value: "Setzt die Wiedergabe fort.", inline: false },
        { name: `${prefix}stats`, value: "Zeigt Bot-Statistiken (Uptime, Songs, Commands).", inline: false },
        { name: `${prefix}dashboard`, value: "Kompakte Übersicht über Bot & Musik.", inline: false },
        { name: `${prefix}prefix [neu]`, value: "Ändert den Prefix (z.B. `?`, `$`).", inline: false }
      );

    message.channel.send({ embeds: [embed] });
  }
});

// ==== Login ====
client.login(config.token);
