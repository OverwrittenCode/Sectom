import type { ActionType } from "@prisma/client";
import type { APIEmbed as _APIEmbed } from "discord.js";

declare global {
	namespace PrismaJson {
		interface APIEmbed extends _APIEmbed {}

		interface WithEmbed {
			apiEmbed: APIEmbed;
		}

		interface ActiveState {
			disabled?: boolean;
		}

		interface IDLink {
			id: string;
		}

		interface WarningThresholds {
			threshold: number;
			punishment: ActionType;
			duration?: number;
		}

		interface WarningConfiguration extends ActiveState {
			thresholds: WarningThresholds[];
			/**
			 * How much the duration of the same punishment should geometrically increase by.
			 * - Resets back to 1 when the next punishment is hit.
			 *
			 * @example
			 * const nextPunishmentDuration = durationMultiplier ** repeitionCount * baseDurationPunishment
			 * */
			durationMultiplier: number;
		}

		interface BaseContentClusterManagerComponent {
			/**
			 * Must be unique
			 */
			name: string;
		}

		interface BaseContentClusterManagerConfiguration<P extends BasePanel, S extends BaseSubject>
			extends ActiveState {
			panels: P[];
			subjects: S[];
		}

		interface BasePanelComponentPermission {
			staffRoleId?: string;
		}

		interface BasePanel extends BaseContentClusterManagerComponent, WithEmbed {
			subjectNames: string[];
		}

		interface BaseSubject extends BaseContentClusterManagerComponent {
			description?: string;
			emoji?: string;
		}

		interface SuggestionPanel extends BasePanel {
			channelId?: string;
		}
		interface SuggestionSubject extends BaseSubject {}
		interface SuggestionConfiguration
			extends BaseContentClusterManagerConfiguration<SuggestionPanel, SuggestionSubject> {}

		interface TicketPanel extends BasePanel, BasePanelComponentPermission {
			channelId?: string;
		}
		interface TicketSubject extends BaseSubject {}
		interface TicketConfiguration
			extends BaseContentClusterManagerConfiguration<TicketPanel, TicketSubject>,
				BasePanelComponentPermission,
				Partial<WithEmbed> {
			/**
			 * If the create button should prompt the user with the subject and description of the ticket in a ModalSubmit
			 */
			prompt?: boolean;
			autoStaffMention?: boolean;
		}

		interface LevelingRole extends IDLink {
			level: number;
		}

		interface LevelingXPOptions {
			multiplier: number;
			cooldown: number;
			roles: LevelingRole[];
		}

		interface LevelingXPOverride extends Partial<Omit<LevelingXPOptions, "roles">>, IDLink {
			mention: string;
		}

		interface LevelingConfiguration extends ActiveState, LevelingXPOptions {
			stackXPMultipliers: boolean;
			overrides: LevelingXPOverride[];
		}

		interface Configuration {
			warning: WarningConfiguration;
			suggestion: SuggestionConfiguration;
			ticket: TicketConfiguration;
			leveling: LevelingConfiguration;
		}
	}
}
