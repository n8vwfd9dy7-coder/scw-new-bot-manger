require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./scw.db");

// ================= BOT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= DB =================
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

  db.run(`CREATE TABLE IF NOT EXISTS teams (
    guild_id TEXT,
    name TEXT,
    role_id TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS players (
    guild_id TEXT,
    user_id TEXT,
    team TEXT,
    strikes INTEGER DEFAULT 0
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
    console.log(e);
  }
}

// ================= GET CONFIG =================
function getConfig(guildId) {
  return new Promise((res) => {
    db.get(`SELECT * FROM config WHERE guild_id=?`, [guildId], (err, row) => {
      res(row);
    });
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
    .setName("addteam")
    .setDescription("Create team")
    .addStringOption(o => o.setName("name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel")
    .addChannelOption(o => o.setName("channel").setRequired(true))
].map(c => c.toJSON());

// ================= REGISTER COMMANDS =================
async function register() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Commands registered");
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await register();
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
        reply(i, "✅ Setup complete");
      }
    );

    return;
  }

  if (!config) return reply(i, "❌ Run /setup first");

  // ================= ADD TEAM =================
  if (i.commandName === "addteam") {
    await i.deferReply({ ephemeral: true });

    const name = i.options.getString("name");

    db.run(
      `INSERT INTO teams VALUES (?, ?, ?, 0, 0)`,
      [i.guild.id, name, "TEMP_ROLE"],
      (err) => {
        if (err) return reply(i, "❌ Error creating team");
        reply(i, `✅ Team ${name} created (role system can be upgraded next)`);
      }
    );
  }

  // ================= LOCK =================
  if (i.commandName === "lock") {
    await i.deferReply({ ephemeral: true });

    const channel = i.options.getChannel("channel");

    await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
      SendMessages: false
    });

    reply(i, "🔒 Locked channel");
  }

  // ================= UNLOCK =================
  if (i.commandName === "unlock") {
    await i.deferReply({ ephemeral: true });

    const channel = i.options.getChannel("channel");

    await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
      SendMessages: true
    });

    reply(i, "🔓 Unlocked channel");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);