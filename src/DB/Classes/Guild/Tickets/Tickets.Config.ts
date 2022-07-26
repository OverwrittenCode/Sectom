import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import AccessGate from "../../Base/Access/Access.Gate";
import Message from "../../Message/Message.Main";

export default class GuildTicketConfig
  extends AccessGate
  implements Namespaces.Interfaces.Guild.Tickets.Config
{
  @prop({ type: Message })
  public welcomeMessage?: Message;
  @prop({ type: Message })
  public closingMessage?: Message;
  @prop({ type: Message })
  public directMessage?: Message;
  @prop()
  public closingTime?: number;

  @prop({ enum: Namespaces.Enums.Shared.ViewerType })
  public closingPermission?: `${Namespaces.Enums.Shared.ViewerType}`;

  @prop()
  public cooldown?: number;
}
