import { MAINNET, P2SH } from "unchained-bitcoin";

import updateState from "./utils";
import {
  SET_NETWORK,
  SET_TOTAL_SIGNERS,
  SET_REQUIRED_SIGNERS,
  SET_ADDRESS_TYPE,
  SET_FROZEN,
} from "../actions/settingsActions";

const initialState = {
  network: MAINNET,
  totalSigners: 3,
  requiredSigners: 2,
  addressType: P2SH,
  frozen: false,
};

export default (state = initialState, action) => {
  switch (action.type) {
    case SET_NETWORK:
      return updateState(state, { network: action.value });
    case SET_TOTAL_SIGNERS:
      return updateState(state, { totalSigners: action.value });
    case SET_REQUIRED_SIGNERS:
      return updateState(state, { requiredSigners: action.value });
    case SET_ADDRESS_TYPE:
      return updateState(state, { addressType: action.value });
    case SET_FROZEN:
      return updateState(state, { frozen: action.value });
    default:
      return state;
  }
};
