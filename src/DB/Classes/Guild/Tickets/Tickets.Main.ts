import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import GuildTicketGlobal from "./Tickets.Global";
import GuildTicketPanel from "./Tickets.Panel";

export default class GuildTickets
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Tickets.Main
{
  @prop({ type: GuildTicketGlobal })
  public globalOptions?: GuildTicketGlobal;

  @prop({ type: GuildTicketPanel })
  public panelOptions?: mongoose.Types.DocumentArray<GuildTicketPanel>;
}
