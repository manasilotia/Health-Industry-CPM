import React, {useState, useEffect, useContext} from 'react';
import {View, StyleSheet, BackHandler, ViewStyle} from 'react-native';
import {TextInput, IconButton, ActivityIndicator} from 'react-native-paper';
import {Footer} from '../components/footer';
import QRCodeScanner from 'react-native-qrcode-scanner';
import {BarCodeReadEvent} from 'react-native-camera';
import {ConfigContext} from '../contexts/config';
import {useUser} from '../hooks/auth';
import {
  DecryptCredentials,
  IoTCClient,
  IOTC_CONNECT,
  IOTC_LOGGING,
} from 'react-native-azure-iotcentral-client';
import {ErrorDialog} from '../components/utils';
import {getCredentialsFromNumericCode} from '../api/central';
import QRCodeMask from '../components/qrcodeMask';
import {Headline, CPMText, Name} from '../components/typography';
import {useScreenDimensions} from '../hooks/layout';
import {CPMButton} from '../components/buttons';

export type Event = BarCodeReadEvent;

const title = 'GETTING STARTED';
const instructions = 'How would you like to verify your device?';
const numeric = {
  instructions: 'Please enter your verification code.',
  placeholder: 'Enter code',
  button: 'VERIFY',
};
const code = 'ENTER A CODE';
const scan = 'SCAN A CODE';
const footerText =
  'Depending on the preferred user flow, the backend provisioning information can either be mapped to a code or stored in a QR code.';
const qrcodeFooterText =
  'After scanning the QR code, the IoT Central provisioning credentials along with a set of cloud properties such as hospital name will be stored in the app and the device ID to patient mapping will be sent to the Azure API for FHIR.';

interface IVerificationProps {
  onVerify(data: any): Promise<void>;
}

interface IRegistrationProps extends IVerificationProps {
  onClose(): void;
}

function Loading() {
  return (
    <View style={style.loading}>
      <ActivityIndicator size="large" style={{marginVertical: 30}} />
      <Headline>Connecting to Azure IoT Central ...</Headline>
    </View>
  );
}

export function Registration() {
  const {state, dispatch} = useContext(ConfigContext);
  const [user] = useUser();
  const [numeric, setNumeric] = useState(false);
  const [qr, setQR] = useState(false);

  const onVerify = async (data: string) => {
    if (user == null) {
      throw new Error('User not logged in');
    }
    const creds = DecryptCredentials(data, user.id);
    // connect to IoTCentral before passing over
    let iotc = new IoTCClient(
      creds.deviceId,
      creds.scopeId,
      IOTC_CONNECT.DEVICE_KEY,
      creds.deviceKey,
    );
    iotc.setModelId(creds.modelId);
    iotc.setLogging(IOTC_LOGGING.ALL);
    await iotc.connect();
    dispatch({
      type: 'CONNECT',
      payload: iotc,
    });
  };

  const onBack = () => {
    setQR(false);
    setNumeric(false);
    return true;
  };

  useEffect(() => {
    BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => {
      BackHandler.removeEventListener('hardwareBackPress', onBack);
    };
  }, []);

  if (!user || state.centralClient !== undefined) {
    return null;
  }

  if (numeric) {
    return <NumericCode onVerify={onVerify} onClose={onBack} />;
  }
  if (qr) {
    return <QRCode onVerify={onVerify} onClose={onBack} />;
  }
  return (
    <View style={{flex: 4, ...style.container}}>
      <View style={{flex: 1, justifyContent: 'center'}}>
        <Name style={style.title}>{title}</Name>
      </View>
      <View style={{flex: 1, justifyContent: 'center'}}>
        <Name style={style.instructions}>{instructions}</Name>
      </View>
      <View style={{flex: 2}}>
        <CPMButton
          mode="outlined"
          style={style.button}
          onPress={() => setNumeric(true)}>
          {code}
        </CPMButton>
        <CPMButton
          mode="contained"
          style={{marginBottom: 50, ...style.button}}
          onPress={() => setQR(true)}>
          {scan}{' '}
        </CPMButton>
        <SimulatedButton />
      </View>
      <Footer text={footerText} />
    </View>
  );
}

function NumericCode(props: IRegistrationProps) {
  const [data, setData] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const verify = async () => {
    try {
      setLoading(true);
      const creds = await getCredentialsFromNumericCode(data);
      await props.onVerify(creds);
    } catch (e) {
      setLoading(false);
      setErrorVisible(true);
    }
  };
  if (loading) {
    return <Loading />;
  }
  return (
    <View style={{flex: 1, ...style.container}}>
      <IconButton
        icon="arrow-left"
        onPress={props.onClose}
        size={30}
        style={{marginTop: 40, alignSelf: 'flex-start'}}
      />
      <View style={{flex: 1, marginTop: '5%'}}>
        <CPMText style={style.instructions}>{numeric.instructions}</CPMText>
      </View>
      <View style={{flex: 2, width: '80%'}}>
        <TextInput
          placeholder={numeric.placeholder}
          value={data}
          onChangeText={setData}
          numberOfLines={1}
          onSubmitEditing={verify}></TextInput>
        <CPMButton mode="contained" style={style.button} onPress={verify}>
          {numeric.button}
        </CPMButton>
      </View>
      <View style={{flex: 2}}>
        <SimulatedButton />
      </View>
      <View style={{flex: 1}}>
        <Footer text={footerText} />
      </View>
      <ErrorDialog
        title="Error"
        text="Failed to parse inserted code. Try again or use a simulated connection"
        visible={errorVisible}
        setVisible={val => {
          setErrorVisible(val);
          setLoading(val);
        }}
      />
    </View>
  );
}

function QRCode(props: IRegistrationProps) {
  const {screen} = useScreenDimensions();
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  if (loading) {
    return <Loading />;
  }
  return (
    <View style={{...style.container, flex: 2, position: 'relative'}}>
      <IconButton
        icon="arrow-left"
        onPress={props.onClose}
        size={30}
        color="white"
        style={{
          position: 'absolute',
          alignSelf: 'flex-start',
          top: 40,
          zIndex: 2,
        }}
      />
      <QRCodeScanner
        onRead={async (e: Event) => {
          setLoading(true);
          try {
            await props.onVerify(e.data);
          } catch (e) {
            setLoading(false);
            setErrorVisible(true);
          }
        }}
        customMarker={
          <View style={{marginTop: -(screen.width / 2)}}>
            <QRCodeMask />
            <CPMText style={{...style.qrtext, ...style.center}}>
              Move closer to scan
            </CPMText>
          </View>
        }
        showMarker={true}
        topViewStyle={{flex: 0, height: 0}}
        cameraStyle={{height: screen.height + 20, width: screen.width}}
        bottomContent={
          <View style={{flex: 2, justifyContent: 'flex-end'}}>
            <SimulatedButton textColor="white" />
            <Footer text={qrcodeFooterText} textColor="white" />
          </View>
        }
      />
      <ErrorDialog
        title="Error"
        text="Failed to parse inserted code. Try again or use a simulated connection"
        visible={errorVisible}
        setVisible={val => {
          setErrorVisible(val);
          setLoading(val);
        }}
      />
    </View>
  );
}

function SimulatedButton(props: {textColor?: string}) {
  const {dispatch} = useContext(ConfigContext);
  const {orientation} = useScreenDimensions();

  const viewStyle: ViewStyle = orientation == 'portrait' ? {} : {};
  return (
    <View style={{alignItems: 'center', ...viewStyle}}>
      <CPMText style={props.textColor ? {color: props.textColor} : {}}>
        Don't have a code?
      </CPMText>
      <CPMButton
        style={style.button}
        mode="contained"
        onPress={() => {
          // set simulation. data will not be sent to IoTCentral
          dispatch({
            type: 'CONNECT',
            payload: null,
          });
        }}>
        Use simulated code
      </CPMButton>
    </View>
  );
}

const style = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 30,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  instructions: {
    fontSize: 24,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'center',
    width: 230,
    height: 40,
    marginVertical: 20,
  },
  center: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    left: 0,
    right: 0,
  },
  qrtext: {
    fontSize: 15,
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
