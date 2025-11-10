import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import logger from '../logger.js';

export const data = new SlashCommandBuilder()
  .setName('approve-character')
  .setDescription('Approve a new player and grant them player access')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to approve')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction) {
  try {
    // Defer reply in case this takes a moment
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user');
    const guild = interaction.guild;

    // Check if user has staff role
    const member = await guild.members.fetch(interaction.user.id);
    if (config.discord.staffRoleId && !member.roles.cache.has(config.discord.staffRoleId)) {
      await interaction.editReply({
        content: 'You do not have permission to use this command. Staff role required.',
        ephemeral: true,
      });
      return;
    }

    // Get the target member
    const targetMember = await guild.members.fetch(targetUser.id);
    if (!targetMember) {
      await interaction.editReply({
        content: `Could not find user ${targetUser.tag} in this server.`,
        ephemeral: true,
      });
      return;
    }

    // Add Player role
    if (config.discord.playerRoleId) {
      await targetMember.roles.add(config.discord.playerRoleId);
      logger.info({ userId: targetUser.id, roleId: config.discord.playerRoleId }, 'Added Player role');
    } else {
      logger.warn('DISCORD_PLAYER_ROLE_ID not configured');
    }

    // Remove Roll Dice role
    let rollDiceRoleRemoved = false;
    let rollDiceRoleError = null;
    if (config.discord.rollDiceRoleId) {
      if (targetMember.roles.cache.has(config.discord.rollDiceRoleId)) {
        try {
          await targetMember.roles.remove(config.discord.rollDiceRoleId);
          logger.info({ userId: targetUser.id, roleId: config.discord.rollDiceRoleId }, 'Removed Roll Dice role');
          rollDiceRoleRemoved = true;
        } catch (err) {
          logger.error({ err, userId: targetUser.id, roleId: config.discord.rollDiceRoleId }, 'Failed to remove Roll Dice role - check role hierarchy');
          rollDiceRoleError = 'Missing Permissions - bot role must be higher in hierarchy';
        }
      } else {
        rollDiceRoleRemoved = true; // User didn't have the role
      }
    } else {
      logger.warn('DISCORD_ROLL_DICE_ROLE_ID not configured');
    }

    // Post welcome message in the channel where the command was run
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2) // Blurple
      .setTitle('Character Approved!')
      .setDescription(
        `Welcome to the Triboar Guildhall, ${targetUser}!\n` +
        `Your character has been reviewed and approved — you're now an official member of the Guild.\n\n` +

        `**Next Steps**\n\n` +

        `**Import Your Character**\n` +
        `Head to <#botspam> and use Avrae to import your sheet:\n` +
        `\`\`\`\n!import\n\`\`\`\n` +
        `Then set up your bags and gold using the commands in the pinned messages of that channel.\n` +
        `This ensures your inventory and coins sync correctly with Guild records.\n\n` +

        `**Prepare for Adventure**\n` +
        `Review the <#quest-board> to see which adventures are currently recruiting.\n` +
        `When you find one you're interested in, add your name to the <#queue> to join the next available party.\n\n` +

        `**Try a Survival Game**\n` +
        `Want to earn a little extra gold and XP between quests?\n` +
        `Head over to <#survival-games> — short daily challenges that test your skills in combat, wit, and endurance.\n\n` +

        `**Meet the Guild**\n` +
        `Stop by <#guildhall-chat> to introduce yourself and say hello to your fellow adventurers.\n` +
        `The Guild is always looking for new allies to share the road, the risk, and the rewards.\n\n` +

        `Welcome again to the Triboar Guildhall.\n` +
        `The fires are warm, the ale is flowing, and adventure awaits!\n` +
        `*May your rolls be high and your blades stay sharp.*`
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: 'Approved by ' + interaction.user.tag });

    await interaction.channel.send({ embeds: [welcomeEmbed] });
    logger.info({ userId: targetUser.id, channelId: interaction.channel.id }, 'Posted welcome message');

    // Send success message to staff member
    let rollDiceRoleStatus;
    if (!config.discord.rollDiceRoleId) {
      rollDiceRoleStatus = '⚠️ Not configured';
    } else if (rollDiceRoleError) {
      rollDiceRoleStatus = `❌ ${rollDiceRoleError}`;
    } else if (rollDiceRoleRemoved) {
      rollDiceRoleStatus = '✅ Removed';
    } else {
      rollDiceRoleStatus = '⚠️ User did not have role';
    }

    const successEmbed = new EmbedBuilder()
      .setColor(rollDiceRoleError ? 0xFEE75C : 0x57F287) // Yellow if error, Green if success
      .setTitle('Player Approved!')
      .setDescription(`Successfully approved ${targetUser}`)
      .addFields(
        { name: 'Player Role', value: config.discord.playerRoleId ? '✅ Added' : '⚠️ Not configured', inline: true },
        { name: 'Roll Dice Role', value: rollDiceRoleStatus, inline: true },
        { name: 'Welcome Message', value: '✅ Posted in this channel', inline: true }
      )
      .setTimestamp();

    if (rollDiceRoleError) {
      successEmbed.setFooter({ text: '⚠️ Tip: Move the bot\'s role higher in Server Settings → Roles' });
    }

    await interaction.editReply({ embeds: [successEmbed], ephemeral: true });

    logger.info({
      staffUser: interaction.user.id,
      targetUser: targetUser.id,
    }, 'Player approved successfully');

  } catch (err) {
    logger.error({ err, interaction: interaction.commandName }, 'Error executing approve-character command');

    const errorMessage = 'An error occurred while approving the player. Please check the logs.';

    if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}
