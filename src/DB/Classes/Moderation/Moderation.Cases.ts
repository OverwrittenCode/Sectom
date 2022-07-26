import { modelOptions, prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";
import UpdateLog from "../Base/Base.UpdateLog";

@modelOptions({ schemaOptions: { collection: `moderation-cases` } })
export default class ModerationCases
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Moderation.Cases
{
  @prop({ required: true, immutable: true })
  public readonly guildID!: string;

  @prop({ required: true, unique: true, immutable: true })
  public readonly caseID!: string;

  @prop({ enum: Namespaces.Enums.Punishment.Type, default: "MANUAL" })
  public type?: `${Namespaces.Enums.Punishment.Type}`;

  @prop({ required: true, type: UpdateLog })
  public targetedAt: UpdateLog;

  @prop()
  public endsAt?: Date;

  @prop()
  public ended?: boolean;
}
