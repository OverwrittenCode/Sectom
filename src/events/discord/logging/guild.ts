import { ActionType } from "@prisma/client";
import {
	AutoModerationActionType,
	AutoModerationRuleEventType,
	AutoModerationRuleKeywordPresetType,
	AutoModerationRuleTriggerType,
	EmbedBuilder,
	Events,
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildMFALevel,
	GuildNSFWLevel,
	GuildPremiumTier,
	GuildVerificationLevel,
	Locale
} from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { DiscordEventLogManager } from "~/models/framework/managers/DiscordEventLogManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";

@Discord()
export abstract class GuildLog {
	@On({ event: Events.GuildUpdate })
	public guildUpdate([oldGuild, newGuild]: ArgsOf<Events.GuildUpdate>) {
		const embed = new EmbedBuilder()
			.setAuthor({ name: newGuild.name, iconURL: newGuild.iconURL() ?? void 0 })
			.setThumbnail(newGuild.iconURL());

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldGuild,
			new: newGuild,
			actionType: ActionType.DISCORD_SERVER_UPDATE,
			options: {
				name: true,
				nameAcronym: true,
				description: true,
				vanityURLCode: true,
				afkTimeout: true,
				afkChannel: true,
				publicUpdatesChannel: true,
				systemChannel: true,
				partnered: true,
				verified: true,
				maxVideoChannelUsers: true,
				premiumProgressBarEnabled: true,
				rulesChannel: true,
				safetyAlertsChannel: true,
				widgetChannel: true,
				widgetEnabled: true,
				verificationLevel: GuildVerificationLevel,
				defaultMessageNotifications: GuildDefaultMessageNotifications,
				explicitContentFilter: GuildExplicitContentFilter,
				nsfwLevel: GuildNSFWLevel,
				mfaLevel: GuildMFALevel,
				preferredLocale: Locale,
				premiumTier: GuildPremiumTier,
				icon() {
					return {
						name: "Icon URL",
						transformer(_value, clazz) {
							return clazz.iconURL();
						}
					};
				},
				banner() {
					return {
						name: "Banner URL",
						transformer(_value, clazz) {
							return clazz.bannerURL();
						}
					};
				},
				discoverySplash() {
					return {
						name: "Discovery Splash URL",
						transformer(_value, clazz) {
							return clazz.discoverySplashURL();
						}
					};
				},
				splash() {
					return {
						name: "Splash URL",
						transformer(_, clazz) {
							return clazz.splashURL();
						}
					};
				},
				features() {
					return {
						transformer(value) {
							return value.map((str) => StringUtils.convertToTitleCase(str, "_"));
						}
					};
				},
				autoModerationRules(...diff) {
					const [before, after] = diff.map(({ cache }) =>
						cache.map((rule) => {
							rule.actions = rule.actions.map((action) => {
								Object.assign(action, { type: AutoModerationActionType[action.type] });

								return action;
							});

							Object.assign(rule, {
								eventType: AutoModerationRuleEventType[rule.eventType],
								exemptChannels: rule.exemptChannels.map((channel) => channel.toString()),
								exemptRoles: rule.exemptRoles.map((role) => role.toString()),
								triggerType: AutoModerationRuleTriggerType[rule.triggerType]
							});

							Object.assign(rule.triggerMetadata, {
								presets: rule.triggerMetadata.presets.map(
									(preset) => AutoModerationRuleKeywordPresetType[preset]
								)
							});

							return rule;
						})
					);

					const changes = ObjectUtils.getChangesByDiscriminator(before, after, "id");

					return {
						fieldValue: EmbedManager.convertObjectToIndentedFieldValues(changes)
					};
				}
			}
		});
	}
}
