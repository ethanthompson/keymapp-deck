import streamDeck from "@elgato/streamdeck";
import { SetLayerAction } from "./actions/set-layer";
import { IncreaseBrightnessAction, DecreaseBrightnessAction } from "./actions/keyboard-brightness";
import { SetRgbAllAction } from "./actions/set-rgb-all";

streamDeck.actions.registerAction(new SetLayerAction());
streamDeck.actions.registerAction(new IncreaseBrightnessAction());
streamDeck.actions.registerAction(new DecreaseBrightnessAction());
streamDeck.actions.registerAction(new SetRgbAllAction());
streamDeck.connect();
