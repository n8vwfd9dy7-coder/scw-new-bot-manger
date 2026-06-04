require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

// ================= SAFETY CHECK =================
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.log("❌ Missing ENV variables (DISCORD_TOKEN / CLIENT_ID / GUILD_ID)");
  process.exit(1);
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= DB =================
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT PRIMARY KEY,
    owner_role TEXT,
    admin_role TEXT,
    mod_role TEXT,
    captain_role TEXT,
    free_agent_role TEXT,
    score_channel TEXT,
    strike_channel TEXT
  )`);
});

// ================= SAFE REPLY =================
async function reply(i, msg) {
  try {
    if (i.deferred || i.replied) {
      await i.editReply(msg);
    } else {
      await i.reply({ content: msg, ephemeral: true });
    }
  } catch (e) {
    console.log("Reply error:", e);
  }
}

// ================= GET CONFIG =================
function getConfig(guildId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT * FROM config WHERE guild_id=?`,
      [guildId],
      (err, row) => resolve(row)
    );
  });
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup SCW system")
    .addStringOption(o => o.setName("owner_role").setRequired(true))
    .addStringOption(o => o.setName("admin_role").setRequired(true))
    .addStringOption(o => o.setName("mod_role").setRequired(true))
    .addStringOption(o => o.setName("captain_role").setRequired(true))
    .addStringOption(o => o.setName("free_agent_role").setRequired(true))
    .addStringOption(o => o.setName("score_channel").setRequired(true))
    .addStringOption(o => o.setName("strike_channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel")
    .addChannelOption(o => o.setName("channel").setRequired(true))
].map(c => c.toJSON());

// ================= REGISTER COMMANDS =================
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.log("❌ Command registration failed:", err);
  }
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const config = await getConfig(i.guild.id);

  // ================= SETUP =================
  if (i.commandName === "setup") {
    await i.deferReply({ ephemeral: true });

    db.run(
      `INSERT OR REPLACE INTO config VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        i.guild.id,
        i.options.getString("owner_role"),
        i.options.getString("admin_role"),
        i.options.getString("mod_role"),
        i.options.getString("captain_role"),
        i.options.getString("free_agent_role"),
        i.options.getString("score_channel"),
        i.options.getString("strike_channel")
      ],
      (err) => {
        if (err) return reply(i, "❌ Setup failed");
        reply(i, "✅ SCW setup complete");
      }
    );

    return;
  }

  // block if not setup
  if (!config) return reply(i, "❌ Run /setup first");

  // ================= LOCK =================
  if (i.commandName === "lock") {
    await i.deferReply({ ephemeral: true });

    const channel = i.options.getChannel("channel");

    try {
      await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
        SendMessages: false
      });

      reply(i, "🔒 Channel locked");
    } catch (e) {
      console.log(e);
      reply(i, "❌ Lock failed (permissions issue)");
    }
  }

  // ================= UNLOCK =================
  if (i.commandName === "unlock") {
    await i.deferReply({ ephemeral: true });

    const channel = i.options.getChannel("channel");

    try {
      await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
        SendMessages: true
      });

      reply(i, "🔓 Channel unlocked");
    } catch (e) {
      console.log(e);
      reply(i, "❌ Unlock failed (permissions issue)");
    }
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);