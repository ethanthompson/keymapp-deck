import streamDeck from "@elgato/streamdeck";
import { SetLayerAction } from "./actions/set-layer";

streamDeck.actions.registerAction(new SetLayerAction());
streamDeck.connect();
