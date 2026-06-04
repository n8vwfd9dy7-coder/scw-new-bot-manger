require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
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

// ================= SAFE LOG =================
function log(err) {
  console.log("⚠️", err);
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup SCW bot")
    .addStringOption(o => o.setName("owner_role").setRequired(true))
    .addStringOption(o => o.setName("admin_role").setRequired(true))
    .addStringOption(o => o.setName("mod_role").setRequired(true))
    .addStringOption(o => o.setName("captain_role").setRequired(true))
    .addStringOption(o => o.setName("free_agent_role").setRequired(true))
    .addStringOption(o => o.setName("score_channel").setRequired(true))
    .addStringOption(o => o.setName("strike_channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock channel")
    .addChannelOption(o => o.setName("channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock channel")
    .addChannelOption(o => o.setName("channel").setRequired(true))
].map(c => c.toJSON());

// ================= REGISTER =================
async function register() {
  try {
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
      console.log("❌ Missing env variables");
      return;
    }

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
    log(err);
  }
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await register();
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (i) => {
  try {
    if (!i.isChatInputCommand()) return;

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
          if (err) {
            log(err);
            return i.editReply("❌ Setup failed");
          }
          i.editReply("✅ Setup complete");
        }
      );

      return;
    }

    const config = await new Promise((res) => {
      db.get(`SELECT * FROM config WHERE guild_id=?`, [i.guild.id], (e, row) => {
        res(row);
      });
    });

    if (!config) {
      return i.reply({ content: "❌ Run /setup first", ephemeral: true });
    }

    // ================= LOCK =================
    if (i.commandName === "lock") {
      await i.deferReply({ ephemeral: true });

      const channel = i.options.getChannel("channel");

      await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
        SendMessages: false
      });

      return i.editReply("🔒 Locked");
    }

    // ================= UNLOCK =================
    if (i.commandName === "unlock") {
      await i.deferReply({ ephemeral: true });

      const channel = i.options.getChannel("channel");

      await channel.permissionOverwrites.edit(i.guild.roles.everyone, {
        SendMessages: true
      });

      return i.editReply("🔓 Unlocked");
    }

  } catch (err) {
    log(err);
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.log("❌ Login failed:", err);
});