import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import AccessGate from "../../Base/Access/Access.Gate";

export default class GuildSuggestions
  extends AccessGate
  implements Namespaces.Interfaces.Guild.Suggestions.Main
{
  @prop({ required: true })
  public identifier!: string;

  @prop()
  public approvalChannel?: string;

  @prop()
  public implimentedChannel?: string;

  @prop()
  public rejectionChannel?: string;

  @prop({ enum: Namespaces.Enums.Shared.ViewerType })
  public editPermission?: `${Namespaces.Enums.Shared.ViewerType}`;

  @prop()
  public cooldown?: number;
}
