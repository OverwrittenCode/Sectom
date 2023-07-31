import type { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";

export const disableButtons = (rows: ActionRowBuilder<ButtonBuilder>[]) => {
	rows.forEach((row) => row.components.map((r) => r.setDisabled(true)));

	return rows;
};
