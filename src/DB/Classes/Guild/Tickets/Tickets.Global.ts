import { modelOptions, prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import GuildTicketConfig from "./Tickets.Config";

export default class GuildTicketGlobal
  extends GuildTicketConfig
  implements Namespaces.Interfaces.Guild.Tickets.Global
{
  @prop()
  public globalStorageCapicity?: number;

  @prop()
  public globalUserCreationLimit?: number;
}
