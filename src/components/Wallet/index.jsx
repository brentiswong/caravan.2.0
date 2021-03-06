import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  validateBIP32Path,
  validateExtendedPublicKey,
  satoshisToBitcoins,
} from "unchained-bitcoin";
import { Grid, Box, Button, FormHelperText } from "@material-ui/core";
import { downloadFile } from "../../utils";
import {
  updateDepositSliceAction,
  updateChangeSliceAction,
  resetWallet as resetWalletAction,
  updateWalletNameAction as updateWalletNameActionImport,
} from "../../actions/walletActions";
import { fetchSliceData as fetchSliceDataAction } from "../../actions/braidActions";
import walletSelectors from "../../selectors";
import { CARAVAN_CONFIG } from "./constants";

// Components

import WalletInfoCard from "./WalletInfoCard";
import NetworkPicker from "../NetworkPicker";
import QuorumPicker from "../QuorumPicker";
import AddressTypePicker from "../AddressTypePicker";
import ClientPicker from "../ClientPicker";
import WalletGenerator from "./WalletGenerator";
import ExtendedPublicKeyImporter from "./ExtendedPublicKeyImporter";
import WalletActionsPanel from "./WalletActionsPanel";

import {
  getUnknownAddresses,
  getUnknownAddressSlices,
} from "../../selectors/wallet";

// Actions
import {
  setTotalSigners as setTotalSignersAction,
  setRequiredSigners as setRequiredSignersAction,
  setAddressType as setAddressTypeAction,
  setNetwork as setNetworkAction,
} from "../../actions/settingsActions";
import {
  setExtendedPublicKeyImporterMethod as setExtendedPublicKeyImporterMethodAction,
  setExtendedPublicKeyImporterExtendedPublicKey as setExtendedPublicKeyImporterExtendedPublicKeyAction,
  setExtendedPublicKeyImporterBIP32Path as setExtendedPublicKeyImporterBIP32PathAction,
  setExtendedPublicKeyImporterName as setExtendedPublicKeyImporterNameAction,
  setExtendedPublicKeyImporterFinalized as setExtendedPublicKeyImporterFinalizedAction,
  setExtendedPublicKeyImporterVisible as setExtendedPublicKeyImporterVisibleAction,
} from "../../actions/extendedPublicKeyImporterActions";
import { wrappedActions } from "../../actions/utils";
import {
  SET_CLIENT_TYPE,
  SET_CLIENT_URL,
  SET_CLIENT_USERNAME,
  SET_CLIENT_PASSWORD,
} from "../../actions/clientActions";
import { clientPropTypes, slicePropTypes } from "../../proptypes";

class CreateWallet extends React.Component {
  static validateProperties(config, properties, key) {
    for (let index = 0; index < properties.length; index += 1) {
      const property = properties[index];
      const configObj = key !== "" ? config[key] : config;
      if (!Object.prototype.hasOwnProperty.call(configObj, property)) {
        return `Configuration missing property "${
          key !== "" ? `${key}.` : ""
        }${property}"`;
      }
    }
    return "";
  }

  static validateConfig(config) {
    const configProperties = [
      "name",
      "addressType",
      "network",
      "client",
      "quorum",
      "extendedPublicKeys",
    ];
    const validProperties = CreateWallet.validateProperties(
      config,
      configProperties,
      ""
    );
    if (validProperties !== "") return validProperties;

    const clientProperties =
      config.client.type === "public" ? ["type"] : ["type", "url", "username"];
    const validClient = CreateWallet.validateProperties(
      config,
      clientProperties,
      "client"
    );
    if (validClient !== "") return validClient;

    const quorumProperties = ["requiredSigners", "totalSigners"];
    const validQuorum = CreateWallet.validateProperties(
      config,
      quorumProperties,
      "quorum"
    );
    if (validQuorum !== "") return validQuorum;

    return CreateWallet.validateExtendedPublicKeys(
      config.extendedPublicKeys,
      config.network
    );
  }

  static validateExtendedPublicKeys(xpubs, network) {
    const xpubFields = {
      name: (name, index) =>
        typeof name === "string"
          ? ""
          : `Extended public key ${index} name must be a string`,
      bip32Path: (bip32Path, index) => {
        if (xpubs[index - 1].method === "text") return "";
        const pathError = validateBIP32Path(bip32Path);
        if (pathError !== "")
          return `Extended public key ${index} error: ${pathError}`;
        return "";
      },
      xpub: (xpub) => validateExtendedPublicKey(xpub, network),
      method: (method, index) =>
        // eslint-disable-next-line no-bitwise
        ~["trezor", "ledger", "hermit", "xpub", "text"].indexOf(method) // FIXME
          ? ""
          : `Invalid method for extended public key ${index}`,
    };

    const keys = Object.keys(xpubFields);
    for (let xpubIndex = 0; xpubIndex < xpubs.length; xpubIndex += 1) {
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        const value = xpubs[xpubIndex][key];
        const valueError = xpubFields[key](value, xpubIndex + 1);
        if (valueError !== "") return valueError;
      }
    }
    return "";
  }

  constructor(props) {
    super(props);
    this.state = {
      configError: "",
      configJson: "",
      refreshing: false,
      generating: false,
    };
  }

  componentDidMount() {
    if (sessionStorage) {
      const configJson = sessionStorage.getItem(CARAVAN_CONFIG);
      if (configJson) this.setConfigJson(configJson);
    }
  }

  setConfigJson(configJson) {
    let configError;
    try {
      const config = JSON.parse(configJson);
      configError = CreateWallet.validateConfig(config);
    } catch (parseError) {
      configError = "Invlaid JSON";
    }

    if (sessionStorage) sessionStorage.setItem(CARAVAN_CONFIG, configJson);

    // async since importDetails needs the updated state for it to work
    this.setState({ configJson, configError }, () => {
      if (configError === "") this.importDetails();
    });
  }

  setGenerating(_val) {
    const { generating } = this.state;
    let val = _val;
    if (_val === undefined) val = !generating;
    this.setState({ generating: val });
  }

  handleImport = ({ target }) => {
    const fileReader = new FileReader();

    fileReader.readAsText(target.files[0]);
    fileReader.onload = (event) => {
      const configJson = event.target.result;
      this.setConfigJson(configJson);
    };
  };

  refresh = async () => {
    this.setState({ refreshing: true });
    await this.generatorRefresh();
    this.setState({ refreshing: false });
  };

  importDetails = () => {
    const { configJson } = this.state;
    const {
      setTotalSigners,
      setRequiredSigners,
      setAddressType,
      setNetwork,
      setExtendedPublicKeyImporterMethod,
      setExtendedPublicKeyImporterExtendedPublicKey,
      setExtendedPublicKeyImporterBIP32Path,
      setExtendedPublicKeyImporterFinalized,
      setExtendedPublicKeyImporterName,
      updateWalletNameAction,
      setClientType,
      setClientUrl,
      setClientUsername,
    } = this.props;

    const walletConfiguration = JSON.parse(configJson);
    setTotalSigners(walletConfiguration.quorum.totalSigners);
    setRequiredSigners(walletConfiguration.quorum.requiredSigners);
    setAddressType(walletConfiguration.addressType);
    setNetwork(walletConfiguration.network);
    updateWalletNameAction(0, walletConfiguration.name);
    setClientType(walletConfiguration.client.type);
    if (walletConfiguration.client.type === "private") {
      setClientUrl(walletConfiguration.client.url);
      setClientUsername(walletConfiguration.client.username);
    }
    walletConfiguration.extendedPublicKeys.forEach(
      (extendedPublicKey, index) => {
        const number = index + 1;
        setExtendedPublicKeyImporterName(number, extendedPublicKey.name);
        setExtendedPublicKeyImporterMethod(number, extendedPublicKey.method);
        setExtendedPublicKeyImporterBIP32Path(
          number,
          extendedPublicKey.bip32Path
        );
        setExtendedPublicKeyImporterExtendedPublicKey(
          number,
          extendedPublicKey.xpub
        );
        setExtendedPublicKeyImporterFinalized(number, true);
      }
    );
  };

  renderWalletImporter = () => {
    const { configError } = this.state;
    const { configuring } = this.props;

    if (configuring)
      return (
        <>
          <label htmlFor="upload-config">
            <input
              style={{ display: "none" }}
              id="upload-config"
              name="upload-config"
              accept="application/json"
              onChange={this.handleImport}
              type="file"
            />

            <Button
              color="primary"
              variant="contained"
              component="span"
              style={{ marginTop: "20px" }}
            >
              Import Wallet Configuration
            </Button>
          </label>
          <FormHelperText error>{configError}</FormHelperText>
        </>
      );
    return "";
  };

  renderSettings = () => {
    const { configuring } = this.props;
    let settings = null;

    if (configuring)
      settings = (
        <Grid item md={4}>
          <Box>
            <QuorumPicker />
          </Box>
          <Box mt={2}>
            <AddressTypePicker />
          </Box>
          <Box mt={2}>
            <NetworkPicker />
          </Box>
          <Box mt={2}>
            <ClientPicker />
          </Box>
        </Grid>
      );

    return settings;
  };

  renderExtendedPublicKeyImporters = () => {
    const { totalSigners, configuring } = this.props;
    const extendedPublicKeyImporters = [];
    for (
      let extendedPublicKeyImporterNum = 1;
      extendedPublicKeyImporterNum <= totalSigners;
      extendedPublicKeyImporterNum += 1
    ) {
      extendedPublicKeyImporters.push(
        <Box
          key={extendedPublicKeyImporterNum}
          mt={extendedPublicKeyImporterNum === 1 ? 0 : 2}
          display={configuring ? "block" : "none"}
        >
          <ExtendedPublicKeyImporter
            key={extendedPublicKeyImporterNum}
            number={extendedPublicKeyImporterNum}
          />
        </Box>
      );
    }
    return extendedPublicKeyImporters;
  };

  downloadWalletDetails = (event) => {
    event.preventDefault();
    const body = this.walletDetailsText();
    const filename = this.walletDetailsFilename();
    downloadFile(body, filename);
  };

  walletDetailsText = () => {
    const {
      addressType,
      network,
      totalSigners,
      requiredSigners,
      walletName,
    } = this.props;
    return `{
  "name": "${walletName}",
  "addressType": "${addressType}",
  "network": "${network}",
  "client":  ${this.clientDetails()},
  "quorum": {
    "requiredSigners": ${requiredSigners},
    "totalSigners": ${totalSigners}
  },
  "extendedPublicKeys": [
${this.extendedPublicKeyImporterBIP32Paths()}
  ]
}
`;
  };

  clientDetails = () => {
    const { client } = this.props;

    if (client.type === "private") {
      return `{
    "type": "private",
    "url": "${client.url}",
    "username": "${client.username}"
  }`;
    }
    return `{
    "type": "public"
  }`;
  };

  extendedPublicKeyImporterBIP32Paths = () => {
    const { totalSigners } = this.props;
    const extendedPublicKeyImporterBIP32Paths = [];
    for (
      let extendedPublicKeyImporterNum = 1;
      extendedPublicKeyImporterNum <= totalSigners;
      extendedPublicKeyImporterNum += 1
    ) {
      extendedPublicKeyImporterBIP32Paths.push(
        `${this.extendedPublicKeyImporterBIP32Path(
          extendedPublicKeyImporterNum
        )}${extendedPublicKeyImporterNum < totalSigners ? "," : ""}`
      );
    }
    return extendedPublicKeyImporterBIP32Paths.join("\n");
  };

  extendedPublicKeyImporterBIP32Path = (number) => {
    const { extendedPublicKeyImporters } = this.props;
    const extendedPublicKeyImporter = extendedPublicKeyImporters[number];
    const bip32Path =
      extendedPublicKeyImporter.method === "text"
        ? "Unknown (make sure you have written this down previously!)"
        : extendedPublicKeyImporter.bip32Path;
    return `    {
      "name": "${extendedPublicKeyImporter.name}",
      "bip32Path": "${bip32Path}",
      "xpub": "${extendedPublicKeyImporter.extendedPublicKey}",
      "method": "${extendedPublicKeyImporter.method}"
    }`;
  };

  walletDetailsFilename = () => {
    const {
      totalSigners,
      requiredSigners,
      addressType,
      walletName,
    } = this.props;
    return `bitcoin-${requiredSigners}-of-${totalSigners}-${addressType}-${walletName}.json`;
  };

  totalBalance = () => {
    const { deposits, change } = this.props;
    if (!Object.keys(deposits.nodes).length) return "";
    const btc = satoshisToBitcoins(
      deposits.balanceSats.plus(change.balanceSats)
    ).toFixed();
    return btc;
  };

  clearConfig = (e) => {
    const { setExtendedPublicKeyImporterVisible, resetWallet } = this.props;
    e.preventDefault();
    resetWallet();
    setExtendedPublicKeyImporterVisible(true);
    this.setState({ generating: false });
  };

  /**
   * Callback function to pass to the address importer
   * after addresses have been imported we want
   * @param {Array<string>} importedAddresses
   * @param {boolean} rescan - whether or not a rescan is being performed
   */
  async afterImportAddresses(importedAddresses, rescan) {
    // if rescan is true then there's no point in fetching
    // the slice data yet since we likely won't get anything
    // until the rescan is complete
    if (rescan) return;

    const { unknownSlices, fetchSliceData } = this.props;
    const importedSlices = unknownSlices.reduce((slices, slice) => {
      if (importedAddresses.indexOf(slice.multisig.address) > -1)
        slices.push(slice);
      return slice;
    }, []);

    await fetchSliceData(importedSlices);
  }

  render = () => {
    const {
      client,
      configuring,
      confirmedBalance,
      walletName,
      setName,
      deposits,
      change,
      network,
      pendingBalance,
      nodesLoaded,
      frozen,
      unknownAddresses,
    } = this.props;
    const { refreshing, generating } = this.state;
    const walletLoadError =
      change.fetchUTXOsErrors + deposits.fetchUTXOsErrors > 0
        ? "Wallet loaded with errors"
        : "";

    return (
      <>
        <Box mt={3}>
          <Grid container spacing={3}>
            <Grid item xs={10} md={6}>
              <WalletInfoCard
                editable={
                  !Object.keys(deposits.nodes).length ||
                  !Object.keys(change.nodes).length
                }
                walletName={walletName}
                setName={setName}
                balance={+satoshisToBitcoins(confirmedBalance).toFixed()}
                pendingBalance={+satoshisToBitcoins(pendingBalance).toFixed()}
                network={network}
              />
            </Grid>
            <Grid item xs={10} md={6}>
              {(nodesLoaded || frozen) && (
                <WalletActionsPanel
                  addresses={unknownAddresses}
                  refreshing={refreshing}
                  walletActivated={nodesLoaded}
                  handleRefresh={() => this.refresh()}
                  onClearConfig={(e) => {
                    this.clearConfig(e);
                  }}
                  onDownloadConfig={(e) => this.downloadWalletDetails(e)}
                  client={client}
                  onImportAddresses={(addresses, rescan) =>
                    this.afterImportAddresses(rescan)
                  }
                />
              )}
            </Grid>
          </Grid>
        </Box>
        {walletLoadError.length ? (
          <FormHelperText style={{ float: "right", padding: "11px" }} error>
            {walletLoadError}
          </FormHelperText>
        ) : (
          ""
        )}
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              {this.renderWalletImporter()}
            </Grid>
            <Grid item md={configuring ? 8 : 12}>
              {this.renderExtendedPublicKeyImporters()}
              <Box mt={2}>
                <WalletGenerator
                  generating={generating}
                  setGenerating={(value) => this.setGenerating(value)}
                  downloadWalletDetails={this.downloadWalletDetails}
                  // eslint-disable-next-line no-return-assign
                  refreshNodes={(click) => (this.generatorRefresh = click)} // FIXME TIGHT COUPLING ALERT, this calls function downstream
                />
              </Box>
            </Grid>
            {this.renderSettings()}
          </Grid>
        </Box>
      </>
    );
  };
}

CreateWallet.propTypes = {
  addressType: PropTypes.string.isRequired,
  change: PropTypes.shape({
    balanceSats: PropTypes.shape({}),
    fetchUTXOsErrors: PropTypes.number,
    nodes: PropTypes.shape({}),
  }).isRequired,
  client: PropTypes.shape(clientPropTypes).isRequired,
  configuring: PropTypes.bool.isRequired,
  deposits: PropTypes.shape({
    balanceSats: PropTypes.shape({
      plus: PropTypes.func,
    }),
    fetchUTXOsErrors: PropTypes.number,
    nodes: PropTypes.shape({}),
  }).isRequired,
  confirmedBalance: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  extendedPublicKeyImporters: PropTypes.shape({}).isRequired,
  frozen: PropTypes.bool.isRequired,
  fetchSliceData: PropTypes.func.isRequired,
  network: PropTypes.string.isRequired,
  nodesLoaded: PropTypes.bool.isRequired,
  pendingBalance: PropTypes.number,
  requiredSigners: PropTypes.number.isRequired,
  resetWallet: PropTypes.func.isRequired,
  setTotalSigners: PropTypes.func.isRequired,
  setRequiredSigners: PropTypes.func.isRequired,
  setAddressType: PropTypes.func.isRequired,
  setName: PropTypes.func.isRequired,
  setNetwork: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterMethod: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterExtendedPublicKey: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterBIP32Path: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterFinalized: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterName: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterVisible: PropTypes.func.isRequired,
  setClientType: PropTypes.func.isRequired,
  setClientUrl: PropTypes.func.isRequired,
  setClientUsername: PropTypes.func.isRequired,
  totalSigners: PropTypes.number.isRequired,
  updateWalletNameAction: PropTypes.func.isRequired,
  unknownAddresses: PropTypes.arrayOf(PropTypes.string).isRequired,
  unknownSlices: PropTypes.arrayOf(PropTypes.shape(slicePropTypes)).isRequired,
  walletName: PropTypes.string.isRequired,
};

CreateWallet.defaultProps = {
  pendingBalance: 0,
};

function mapStateToProps(state) {
  return {
    ...state.settings,
    ...state.quorum,
    ...{
      walletName: state.wallet.common.walletName,
      nodesLoaded: state.wallet.common.nodesLoaded,
      walletMode: state.wallet.common.walletMode,
    },
    confirmedBalance: walletSelectors.getConfirmedBalance(state),
    pendingBalance: walletSelectors.getPendingBalance(state),
    unknownAddresses: getUnknownAddresses(state),
    unknownSlices: getUnknownAddressSlices(state),
    ...state.wallet,
    client: state.client,
  };
}

const mapDispatchToProps = {
  fetchSliceData: fetchSliceDataAction,
  resetWallet: resetWalletAction,
  setName: updateWalletNameActionImport,
  setTotalSigners: setTotalSignersAction,
  setRequiredSigners: setRequiredSignersAction,
  setAddressType: setAddressTypeAction,
  setNetwork: setNetworkAction,
  setExtendedPublicKeyImporterMethod: setExtendedPublicKeyImporterMethodAction,
  setExtendedPublicKeyImporterExtendedPublicKey: setExtendedPublicKeyImporterExtendedPublicKeyAction,
  setExtendedPublicKeyImporterBIP32Path: setExtendedPublicKeyImporterBIP32PathAction,
  setExtendedPublicKeyImporterName: setExtendedPublicKeyImporterNameAction,
  setExtendedPublicKeyImporterFinalized: setExtendedPublicKeyImporterFinalizedAction,
  setExtendedPublicKeyImporterVisible: setExtendedPublicKeyImporterVisibleAction,
  updateWalletNameAction: updateWalletNameActionImport,
  ...wrappedActions({
    setClientType: SET_CLIENT_TYPE,
    setClientUrl: SET_CLIENT_URL,
    setClientUsername: SET_CLIENT_USERNAME,
    setClientPassword: SET_CLIENT_PASSWORD,
  }),
  updateDepositNode: updateDepositSliceAction,
  updateChangeNode: updateChangeSliceAction,
};

export default connect(mapStateToProps, mapDispatchToProps)(CreateWallet);
