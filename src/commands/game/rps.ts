import { Category, EnumChoice, RateLimit, TIME_UNIT } from "@discordx/utilities";
import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	bold
} from "discord.js";
import { Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import ms from "ms";

import { TargetSlashOption } from "~/helpers/decorators/slashOptions/target.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import type { GameControllerComponent } from "~/models/framework/controllers/GameController.js";
import { GameController } from "~/models/framework/controllers/GameController.js";
import { Enums } from "~/ts/Enums.js";

import type { GuildMember } from "discord.js";

type Outcomes = Record<RPS, Array<[defeatedObject: string, reason: string]>>;

type RPSKey = keyof typeof RPS;

enum RPS {
	Rock = "Rock",
	Paper = "Paper",
	Scissors = "Scissors",
	Lizard = "Lizard",
	Spock = "Spock"
}

@Discord()
@Category(Enums.CommandCategory.Game)
@Guard(RateLimit(TIME_UNIT.seconds, 3))
export abstract class Rps {
	private static readonly maxDecisionTime = ms("10s");
	private static readonly weapons = Object.keys(RPS) as RPSKey[];
	private static readonly outcomes = {
		[RPS.Rock]: [
			[RPS.Scissors, "crushes"],
			[RPS.Lizard, "crushes"]
		],
		[RPS.Paper]: [
			[RPS.Rock, "covers"],
			[RPS.Spock, "disproves"]
		],
		[RPS.Scissors]: [
			[RPS.Paper, "cuts"],
			[RPS.Lizard, "decapitates"]
		],
		[RPS.Lizard]: [
			[RPS.Spock, "poisons"],
			[RPS.Paper, "eats"]
		],
		[RPS.Spock]: [
			[RPS.Rock, "vaporizes"],
			[RPS.Scissors, "smashes"]
		]
	} as Outcomes;
	private static readonly actionRow = new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			Object.values(RPS).map((customId) =>
				new ButtonBuilder().setCustomId(customId).setLabel(customId).setStyle(ButtonStyle.Secondary)
			)
		)
		.toJSON() as GameControllerComponent;

	@Slash({ dmPermission: false, description: `Play ${Rps.weapons.join(", ")}` })
	public async rps(
		@TargetSlashOption({
			entityType: CommandUtils.entityType.USER,
			flags: [Enums.CommandSlashOptionTargetFlags.Guild, Enums.CommandSlashOptionTargetFlags.Passive],
			name: "opponent",
			required: false
		})
		opponent: GuildMember | undefined,
		@SlashChoice(...GameController.bestOfChoices)
		@SlashOption({
			description: "Play to best of N rounds",
			name: "best_of",
			type: ApplicationCommandOptionType.Number
		})
		rounds: number = 1,
		@SlashOption({
			description: "Win by two points",
			name: "deuce",
			type: ApplicationCommandOptionType.Boolean
		})
		deuce: boolean = true,
		@SlashChoice(
			...EnumChoice(ObjectUtils.pickKeys(Enums.GameMode, Enums.GameMode.Classic, Enums.GameMode["Swap Move"]))
		)
		@SlashOption({
			description: "The game mode to apply. All special rules happen randomly.",
			name: "game_mode",
			type: ApplicationCommandOptionType.String
		})
		gameMode: Enums.GameMode = Enums.GameMode.Classic,
		interaction: ChatInputCommandInteraction<"cached">
	) {
		const game = new GameController(interaction, [Rps.actionRow], {
			title: "RPS",
			opponent,
			rounds,
			deuce,
			maxDecisionTime: Rps.maxDecisionTime,
			gameMode,
			onActionCollect(controller, playerActions) {
				for (let i = 0; i < playerActions.size; i++) {
					const action = playerActions.at(i)!;

					const key = action.customId as RPSKey;

					const outcomeData = Rps.outcomes[key];

					const defeatedObjects = outcomeData.filter(([defeatedObject]) =>
						playerActions.find(({ customId }) => defeatedObject === customId)
					);

					if (!defeatedObjects.length) {
						continue;
					}

					const defeatStr = defeatedObjects
						.map(([defeatedObject, reason]) => `${reason} ${bold(defeatedObject)}`)
						.join(", ");

					const winReason = `${bold(key)} ${defeatStr}`;

					return controller.setGameStatus(action.profile, winReason);
				}

				return controller.setGameStatus(`All chose ${bold(playerActions.first()!.customId)}`);
			}
		});

		return await game.init();
	}
}
