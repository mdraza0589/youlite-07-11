import { getProductDetail } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { createOrder, createRazorpayOrder, processRazorpayPayment } from '@/lib/services/orderService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import styles from './CheckoutStyle';
import { Alert } from 'react-native';

import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Loading from '@/app/components/Loading';

/* ---------- TYPES ---------- */
interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  size: string;
  color: string;
  image: { uri: string };
  quantity: number;
  tax_class?: string;
  tax_status?: string;
  payment_methods?: string[]; // Array of supported payment methods for this product
}

interface Address {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
}

type DiscountType = 'percent' | 'fixed_cart' | 'fixed_product' | string;
interface AppliedCouponMeta {
  code: string;
  amount: string;
  discount_type: DiscountType;
}

interface ShippingMethod {
  id: number;
  instance_id: number;
  title: string;
  order: number;
  enabled: boolean;
  method_id: string;
  method_title: string;
  method_description: string;
  settings: {
    title: {
      id: string;
      label: string;
      description: string;
      type: string;
      value: string;
      default: string;
      tip: string;
      placeholder: string;
    };
    tax_status: {
      id: string;
      label: string;
      description: string;
      type: string;
      value: string;
      default: string;
      tip: string;
      placeholder: string;
      options: {
        taxable: string;
        none: string;
      };
    };
    cost: {
      id: string;
      label: string;
      description: string;
      type: string;
      value: string;
      default: string;
      tip: string;
      placeholder: string;
    };
  };
}

interface ShippingLine {
  id: number;
  method_title: string;
  method_id: string;
  instance_id: string;
  total: string;
  total_tax: string;
  taxes: any[];
  tax_status: string;
  meta_data: any[];
}

interface TaxRate {
  id: number;
  country: string;
  state: string;
  postcode: string;
  city: string;
  rate: string;
  name: string;
  priority: number;
  compound: boolean;
  shipping: boolean;
  order: number;
  class: string;
  postcodes: string[];
  cities: string[];
}

interface TaxCalculation {
  tax_total: number;
  shipping_tax_total: number;
  tax_lines: {
    id: number;
    rate_code: string;
    rate_id: number;
    label: string;
    compound: boolean;
    tax_total: number;
    shipping_tax_total: number;
    rate_percent: number;
    tax_class?: string;
  }[];
}

interface PaymentGateway {
  id: string;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  method_title: string;
  method_description: string;
  method_supports: string[];
  settings: {
    [key: string]: {
      id: string;
      label: string;
      description: string;
      type: string;
      value: string;
      default: string;
      tip: string;
      placeholder: string;
      options?: any;
    };
  };
  needs_setup: boolean;
  post_install_scripts: any[];
  settings_url: string;
  connection_url: string | null;
  setup_help_text: string | null;
  required_settings_keys: string[];
  _links: any;
}

const { width } = Dimensions.get('window');

/* ----------------------------- Helpers ----------------------------- */
const toNum = (v: any, fb = 0): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fb;
};

const calcCouponDiscount = (subtotal: number, coupons: AppliedCouponMeta[]) => {
  return coupons.reduce((sum, c) => {
    if (c.discount_type === 'percent') {
      return sum + (subtotal * parseFloat(c.amount) / 100);
    }
    if (c.discount_type === 'fixed_cart') {
      return sum + parseFloat(c.amount);
    }
    return sum;
  }, 0);
};

const calculateShippingCost = (shippingMethod: ShippingMethod, cartItems: CartItem[]): number => {
  const costFormula = shippingMethod.settings.cost.value;

  if (costFormula.includes('[qty]')) {
    const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const baseCost = costFormula.replace('[qty]', totalQuantity.toString());
    try {
      return eval(baseCost);
    } catch (error) {
      console.error('Error evaluating shipping cost formula:', error);
      return toNum(shippingMethod.settings.cost.value);
    }
  } else if (costFormula.includes('[cost]')) {
    const totalCost = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const baseCost = costFormula.replace('[cost]', totalCost.toString());
    try {
      return eval(baseCost);
    } catch (error) {
      console.error('Error evaluating shipping cost formula:', error);
      return toNum(shippingMethod.settings.cost.value);
    }
  } else {
    return toNum(shippingMethod.settings.cost.value);
  }
};

const calculateTaxes = (
  cartItems: CartItem[],
  subtotal: number,
  shippingTotal: number,
  taxRates: TaxRate[]
): TaxCalculation => {
  let tax_total = 0;
  let shipping_tax_total = 0;
  const tax_lines: TaxCalculation['tax_lines'] = [];

  const itemsByTaxClass: { [key: string]: { subtotal: number; items: CartItem[] } } = {};

  cartItems.forEach(item => {
    const taxClass = item.tax_class || 'standard';
    if (!itemsByTaxClass[taxClass]) {
      itemsByTaxClass[taxClass] = { subtotal: 0, items: [] };
    }
    itemsByTaxClass[taxClass].subtotal += item.price * item.quantity;
    itemsByTaxClass[taxClass].items.push(item);
  });

  Object.entries(itemsByTaxClass).forEach(([taxClass, { subtotal: classSubtotal }]) => {
    const applicableRates = taxRates.filter(rate =>
      rate.class === taxClass || (taxClass === 'standard' && rate.class === '')
    );

    applicableRates.forEach(rate => {
      const ratePercent = toNum(rate.rate);
      const item_tax = (classSubtotal * ratePercent) / 100;

      const shipping_tax = rate.shipping ? (shippingTotal * ratePercent) / 100 : 0;

      tax_total += item_tax;
      shipping_tax_total += shipping_tax;

      tax_lines.push({
        id: rate.id,
        rate_code: `TAX-${rate.id}`,
        rate_id: rate.id,
        label: rate.name,
        compound: rate.compound,
        tax_total: item_tax,
        shipping_tax_total: shipping_tax,
        rate_percent: ratePercent,
        tax_class: taxClass
      });
    });
  });

  return {
    tax_total,
    shipping_tax_total,
    tax_lines
  };
};

const calculateGSTBreakdown = (taxCalculation: TaxCalculation) => {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  taxCalculation.tax_lines.forEach(taxLine => {
    const halfTax = taxLine.tax_total / 2;
    cgst += halfTax;
    sgst += halfTax;

    const halfShippingTax = taxLine.shipping_tax_total / 2;
    cgst += halfShippingTax;
    sgst += halfShippingTax;
  });

  return {
    cgst: Number(cgst.toFixed(2)),
    sgst: Number(sgst.toFixed(2)),
    igst: Number(igst.toFixed(2)),
    total: Number((cgst + sgst + igst).toFixed(2))
  };
};

/* -------------------- Payment Method Helpers -------------------- */
const determineAvailablePaymentMethods = (cartItems: CartItem[], paymentGateways: PaymentGateway[]) => {
  // Get enabled payment gateways
  const enabledGateways = paymentGateways.filter(gateway => gateway.enabled);

  // Check if all products support COD
  const allProductsSupportCOD = cartItems.every(item =>
    item.payment_methods?.includes('cod') || !item.payment_methods || item.payment_methods.length === 0
  );

  // Check if any product requires Razorpay (doesn't support COD)
  const anyProductRequiresRazorpay = cartItems.some(item =>
    item.payment_methods && item.payment_methods.length > 0 && !item.payment_methods.includes('cod')
  );

  const availableMethods: {
    method: string;
    gateway: PaymentGateway;
    description: string;
    enabled: boolean;
  }[] = [];

  // Find COD gateway
  const codGateway = enabledGateways.find(gateway => gateway.id === 'cod');
  const razorpayGateway = enabledGateways.find(gateway => gateway.id === 'razorpay');

  // Add COD if available and all products support it
  if (codGateway && allProductsSupportCOD) {
    availableMethods.push({
      method: 'cod',
      gateway: codGateway,
      description: 'Cash on delivery - Pay with cash upon delivery.',
      enabled: true
    });
  }

  // Add Razorpay if available
  if (razorpayGateway) {
    availableMethods.push({
      method: 'razorpay',
      gateway: razorpayGateway,
      description: 'Credit Card/Debit Card/NetBanking - Secure online payment',
      enabled: true
    });
  }

  // If no products support COD but COD is the only available method, disable it
  if (codGateway && !allProductsSupportCOD && availableMethods.length === 0) {
    availableMethods.push({
      method: 'cod',
      gateway: codGateway,
      description: 'Cash on delivery - Not available for some products in your cart',
      enabled: false
    });
  }

  return availableMethods;
};

/* ✅ SEPARATE MEMOIZED INPUT COMPONENT */
const AddressInput = memo(({
  field,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  error,
}: {
  field: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType: any;
  error: string | null;
}) => {
  return (
    <View>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholder={placeholder}
        placeholderTextColor="#64686eff"
        value={value}
        onChangeText={onChangeText}
        returnKeyType="next"
        blurOnSubmit={false}
        keyboardType={keyboardType}
        autoCapitalize={field === 'email' ? 'none' : 'words'} // No auto-capitalization for email
        autoCorrect={field === 'email' ? false : true} // No autocorrect for email
        autoComplete={field === 'email' ? 'email' : 'off'} // Better autofill for email
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});
AddressInput.displayName = 'AddressInput';

/* =================================================================== */
const Checkout: React.FC = () => {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [shipping, setShipping] = useState<Address | null>(null);
  const [billing, setBilling] = useState<Address | null>(null);
  const [sameAddress, setSameAddress] = useState(true);
  const [editAddress, setEditAddress] = useState(false); // Single edit state
  const [placingOrder, setPlacingOrder] = useState(false);
  const [toast, setToast] = useState('');

  // Additional states from Cart
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCouponMeta[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod | null>(null);
  const [shippingLines, setShippingLines] = useState<ShippingLine[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculation>({
    tax_total: 0,
    shipping_tax_total: 0,
    tax_lines: []
  });
  const [taxLoading, setTaxLoading] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<{
    method: string;
    gateway: PaymentGateway;
    description: string;
    enabled: boolean;
  }[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);

  // Animation for loading
  const translateY = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (loading) {
      translateY.value = withRepeat(
        withTiming(-20, { duration: 500, easing: Easing.out(Easing.quad) }),
        -1,
        true
      );
    }
    return () => {
      translateY.value = 0;
    };
  }, [loading, translateY]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  /* -------------------- Load Payment Gateways -------------------- */
  const loadPaymentGateways = async (): Promise<PaymentGateway[]> => {
    try {
      const response = await fetch(
        'https://youlitestore.in/wp-json/wc/v3/payment_gateways?consumer_key=ck_d75d53f48f9fb87921a2523492a995c741d368df&consumer_secret=cs_ae3184c5435dd5d46758e91fa9ed3917d85e0c17'
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch payment gateways: ${response.status}`);
      }

      const gateways: PaymentGateway[] = await response.json();
      console.log('Loaded payment gateways:', gateways);
      return gateways;
    } catch (error) {
      console.error('Error loading payment gateways:', error);
      return [];
    }
  };

  // Load Tax Rates
  const loadTaxRates = async (): Promise<TaxRate[]> => {
    try {
      setTaxLoading(true);
      const response = await fetch(
        'https://youlitestore.in/wp-json/wc/v3/taxes?consumer_key=ck_d75d53f48f9fb87921a2523492a995c741d368df&consumer_secret=cs_ae3184c5435dd5d46758e91fa9ed3917d85e0c17'
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch tax rates: ${response.status}`);
      }

      const rates: TaxRate[] = await response.json();
      console.log('Loaded dynamic tax rates:', rates);
      return rates;
    } catch (error) {
      console.error('Error loading tax rates:', error);
      return [];
    } finally {
      setTaxLoading(false);
    }
  };

  // Load Shipping Methods
  const loadShippingMethods = async (): Promise<ShippingMethod[]> => {
    try {
      setShippingLoading(true);
      const response = await fetch(
        'https://youlitestore.in/wp-json/wc/v3/shipping/zones/1/methods?consumer_key=ck_d75d53f48f9fb87921a2523492a995c741d368df&consumer_secret=cs_ae3184c5435dd5d46758e91fa9ed3917d85e0c17'
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch shipping methods: ${response.status}`);
      }

      const methods: ShippingMethod[] = await response.json();
      const enabledMethods = methods.filter(method => method.enabled);
      console.log('Loaded dynamic shipping methods:', enabledMethods);
      return enabledMethods;
    } catch (error) {
      console.error('Error loading shipping methods:', error);
      return [];
    } finally {
      setShippingLoading(false);
    }
  };

  // Calculate Shipping Lines
  const calculateShippingLines = (methods: ShippingMethod[], items: CartItem[]): ShippingLine[] => {
    if (!methods.length || !items.length) return [];

    const shippingLines: ShippingLine[] = [];

    methods.forEach(method => {
      if (method.enabled) {
        const shippingCost = calculateShippingCost(method, items);

        shippingLines.push({
          id: method.id,
          method_title: method.settings.title.value,
          method_id: method.method_id,
          instance_id: method.instance_id.toString(),
          total: shippingCost.toFixed(2),
          total_tax: "0.00",
          taxes: [],
          tax_status: method.settings.tax_status.value,
          meta_data: []
        });
      }
    });
    return shippingLines;
  };

  // Select Best Shipping Method - Prioritize Flat Rate
  const selectBestShippingMethod = (methods: ShippingMethod[], items: CartItem[]): ShippingMethod | null => {
    if (!methods.length) return null;

    // Always prioritize flat rate if available and enabled
    const flatRateMethod = methods.find(method =>
      method.method_id === 'flat_rate' && method.enabled
    );
    if (flatRateMethod) {
      console.log('Selected Flat Rate as default shipping method');
      return flatRateMethod;
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (subtotal > 999) {
      const freeShippingMethod = methods.find(method =>
        method.method_id === 'free_shipping' || toNum(method.settings.cost.value) === 0
      );
      if (freeShippingMethod) return freeShippingMethod;
    }

    // Fallback to cheapest enabled method
    return methods.reduce((lowest, current) => {
      const currentCost = calculateShippingCost(current, items);
      const lowestCost = calculateShippingCost(lowest, items);
      return currentCost < lowestCost ? current : lowest;
    });
  };

  // Update Tax Calculation
  const updateTaxCalculation = (items: CartItem[] = cartItems, shipping: ShippingLine[] = shippingLines) => {
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const shippingTotal = shipping.reduce((total, line) => total + toNum(line.total), 0);

    if (taxRates.length > 0) {
      const taxCalc = calculateTaxes(items, subtotal, shippingTotal, taxRates);
      console.log('Updated Tax Calculation:', taxCalc);
      setTaxCalculation(taxCalc);
    } else {
      setTaxCalculation({ tax_total: 0, shipping_tax_total: 0, tax_lines: [] });
    }
  };

  // Auto-calculate shipping and tax when dependencies change
  useEffect(() => {
    if (cartItems.length > 0 && taxRates.length > 0) {
      if (shippingMethods.length > 0) {
        const bestMethod = selectBestShippingMethod(shippingMethods, cartItems);
        setSelectedShippingMethod(bestMethod);

        const shippingData = calculateShippingLines(bestMethod ? [bestMethod] : shippingMethods, cartItems);
        setShippingLines(shippingData);

        updateTaxCalculation(cartItems, shippingData);
      } else {
        // No shipping methods: assume free shipping
        setShippingLines([]);
        setSelectedShippingMethod(null);
        updateTaxCalculation(cartItems, []);
      }
    }
  }, [cartItems, shippingMethods, taxRates]);

  // Update payment methods when cart items or payment gateways change
  useEffect(() => {
    if (cartItems.length > 0 && paymentGateways.length > 0) {
      const methods = determineAvailablePaymentMethods(cartItems, paymentGateways);
      setAvailablePaymentMethods(methods);

      // Auto-select the first enabled method, or Razorpay if available
      const firstEnabledMethod = methods.find(m => m.enabled);
      const razorpayMethod = methods.find(m => m.method === 'razorpay' && m.enabled);

      if (razorpayMethod) {
        setSelectedPaymentMethod('razorpay');
      } else if (firstEnabledMethod) {
        setSelectedPaymentMethod(firstEnabledMethod.method);
      } else {
        setSelectedPaymentMethod(null);
      }
    }
  }, [cartItems, paymentGateways]);

  const loadData = async () => {
    console.log('=== LOAD DATA STARTED ===');
    try {
      setLoading(true);
      console.log('📱 Getting session...');
      const session = await getSession();
      console.log('Session:', session);

      if (!session?.user?.id) {
        console.error('❌ No session or user ID found');
        setLoading(false);
        router.replace('/Login/LoginRegisterPage');
        return;
      }

      setUserId(session.user.id);
      console.log('✅ User ID set:', session.user.id);

      console.log('👤 Fetching customer details...');
      const customer = await getCustomerById(session.user.id);
      console.log('Customer data:', customer);

      // Get session email if available
      const sessionEmail = session.user.email;
      console.log('📧 Session email:', sessionEmail);

      // Set billing address as primary (use billing if available, otherwise shipping)
      const billingAddress = customer?.billing || customer?.shipping || {};

      // Set email from session if available
      if (sessionEmail && (!billingAddress.email || billingAddress.email === '')) {
        billingAddress.email = sessionEmail;
        console.log('✅ Set billing email from session:', sessionEmail);
      }

      setBilling(billingAddress);


      // Set shipping address same as billing by default
      setShipping(billingAddress);
      setSameAddress(true);

      // Load coupons
      const couponsMeta = customer?.meta_data?.find((m: any) => m.key === 'applied_coupons')?.value || [];
      console.log('🎫 Coupons meta:', couponsMeta);
      setAppliedCoupons(Array.isArray(couponsMeta) ? couponsMeta : []);

      // DEBUG: Check cart meta data
      const cartMeta = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      console.log('🛒 Cart meta data found:', cartMeta);
      console.log('🛒 Cart items count:', cartMeta.length);
      console.log('🛒 Cart meta data type:', typeof cartMeta);
      console.log('🛒 Is cart meta array?', Array.isArray(cartMeta));

      // Load tax, shipping, and payment gateways in parallel
      const [rates, methods, gateways] = await Promise.all([
        loadTaxRates(),
        loadShippingMethods(),
        loadPaymentGateways()
      ]);

      setTaxRates(rates);
      setShippingMethods(methods);
      setPaymentGateways(gateways);

      if (params.buyNow === 'true' && params.productId && params.quantity) {
        console.log('🛍️ BUY NOW mode');
        console.log('Product ID:', params.productId);
        console.log('Quantity:', params.quantity);

        const res = await getProductDetail(params.productId as string);
        console.log('Product details:', res?.data);

        const p = res?.data;
        if (p) {
          const attrs = Array.isArray(p.attributes) ? p.attributes : [];
          const color = attrs.find((a: any) => a?.name?.toLowerCase().includes('color'))?.options?.[0] || 'N/A';
          const size = attrs.find((a: any) => a?.name?.toLowerCase().includes('size'))?.options?.[0] || 'N/A';

          // Determine payment methods for this product
          const payment_methods = ['cod', 'razorpay']; // Default to supporting both

          const item: CartItem = {
            id: String(p.id),
            name: p.name,
            price: parseFloat(p.sale_price || p.price) || 0,
            originalPrice: parseFloat(p.regular_price || p.price) || 0,
            size,
            color,
            image: { uri: p.images?.[0]?.src || 'https://via.placeholder.com/80' },
            quantity: parseInt(params.quantity as string) || 1,
            tax_class: p.tax_class || 'standard',
            tax_status: p.tax_status || 'taxable',
            payment_methods,
          };
          console.log('✅ Buy Now item added:', item);
          setCartItems([item]);
        } else {
          console.error('❌ Product not found');
        }
      } else {
        console.log('🛒 CART mode');

        // FIX: Better cart data handling
        let cartItemsData = [];

        if (Array.isArray(cartMeta) && cartMeta.length > 0) {
          console.log('🛒 Processing cart items...');

          for (const cartItem of cartMeta) {
            try {
              console.log(`🛒 Fetching product ${cartItem.id}...`);
              const res = await getProductDetail(cartItem.id);
              const p = res?.data;

              if (!p) {
                console.warn(`❌ Product ${cartItem.id} not found`);
                continue;
              }

              const attrs = Array.isArray(p.attributes) ? p.attributes : [];
              const color = attrs.find((a: any) => a?.name?.toLowerCase().includes('color'))?.options?.[0] || 'N/A';
              const size = attrs.find((a: any) => a?.name?.toLowerCase().includes('size'))?.options?.[0] || 'N/A';

              // Determine payment methods for this product
              const payment_methods = ['cod', 'razorpay']; // Default to supporting both

              const item: CartItem = {
                id: String(p.id),
                name: p.name,
                price: parseFloat(p.sale_price || p.price) || 0,
                originalPrice: parseFloat(p.regular_price || p.price) || 0,
                size,
                color,
                image: { uri: p.images?.[0]?.src || 'https://via.placeholder.com/80' },
                quantity: cartItem.quantity || 1,
                tax_class: p.tax_class || 'standard',
                tax_status: p.tax_status || 'taxable',
                payment_methods,
              };
              console.log(`✅ Product ${cartItem.id} added to cart:`, item);
              cartItemsData.push(item);
            } catch (e) {
              console.error(`❌ Failed to load product ${cartItem.id}:`, e);
            }
          }
        } else {
          console.log('🛒 No cart items found or cart is empty');
        }

        console.log('✅ Total cart items loaded:', cartItemsData.length);
        setCartItems(cartItemsData);
      }

    } catch (e) {
      console.error('❌ loadData error:', e);
      showToast('Failed to load checkout data');
    } finally {
      setLoading(false);
      console.log('=== LOAD DATA ENDED ===');
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Validation helper functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone.replace(/\s+/g, ''));
  };

  const validatePostcode = (postcode: string): boolean => {
    const postcodeRegex = /^[1-9][0-9]{5}$/;
    return postcodeRegex.test(postcode);
  };

  const validateAddress = (addr: Address | null, type: string): string | null => {
    if (!addr) return `${type} address is required`;

    if (!addr.first_name?.trim()) return 'First name is required';
    if (!addr.last_name?.trim()) return 'Last name is required';
    if (!addr.address_1?.trim()) return 'Address line 1 is required';
    if (!addr.city?.trim()) return 'City is required';
    if (!addr.state?.trim()) return 'State is required';
    if (!addr.postcode?.trim()) return 'Postcode is required';
    if (!validatePostcode(addr.postcode)) return 'Invalid postcode format (6 digits required)';
    if (!addr.country?.trim()) return 'Country is required';
    if (!addr.phone?.trim()) return 'Phone number is required';
    if (!validatePhone(addr.phone)) return 'Invalid phone number (10 digits required)';

    // Email validation only for billing address
    if (type === 'billing') {
      if (!addr.email?.trim()) return 'Email is required for billing';
      if (!validateEmail(addr.email)) return 'Invalid email format';
    }

    return null;
  };

  const getInputError = (addr: Address | null, field: keyof Address): string | null => {
    if (!addr || !addr[field]) return null;

    const value = addr[field];

    switch (field) {
      case 'email':
        return value && !validateEmail(value) ? 'Invalid email' : null;
      case 'phone':
        return value && !validatePhone(value) ? 'Invalid phone (10 digits)' : null;
      case 'postcode':
        return value && !validatePostcode(value) ? 'Invalid PIN (6 digits)' : null;
      default:
        return null;
    }
  };

  const saveAddress = async () => {
    if (!userId) return;

    const billingError = validateAddress(billing, 'Billing');
    if (billingError) {
      showToast(billingError);
      return;
    }

    try {
      // Save both addresses
      await updateCustomerById(userId, {
        billing: billing,
        shipping: sameAddress ? billing : shipping
      });
      showToast('Address saved successfully');
      setEditAddress(false);
    } catch (e) {
      console.error('Save address error', e);
      showToast('Failed to save address');
    }
  };

  // Handle billing address changes
  // Simplified - always update shipping when billing changes
  const handleBillingChange = useCallback((field: keyof Address, value: string) => {
    setBilling(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };

      // Always update shipping since sameAddress is always true
      setShipping(updated);

      return updated;
    });
  }, []); // Remove sameAddress dependency

  const handleSameAddressToggle = useCallback((value: boolean) => {
    setSameAddress(value);
    if (value && billing) {
      // Copy billing to shipping when toggled on
      setShipping(billing);
    }
  }, [billing]);

  // Address field configuration - UPDATED to include email
  const addressFields: [keyof Address, string, any][] = [
    ['first_name', 'First Name*', 'default'],
    ['last_name', 'Last Name*', 'default'],
    ['company', 'Company (Optional)', 'default'],
    ['address_1', 'Address Line 1*', 'default'],
    ['address_2', 'Address Line 2 (Optional)', 'default'],
    ['city', 'City*', 'default'],
    ['state', 'State*', 'default'],
    ['postcode', 'Postcode* (6 digits)', 'numeric'],
    ['country', 'Country*', 'default'],
    ['email', 'Email*', 'email-address'],
    ['phone', 'Phone* (10 digits)', 'phone-pad'],
  ];

  // Address display helper
  const addrLines = (addr: Address | null) => {
    if (!addr) return [];

    const lines = [
      `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
      addr.company,
      addr.address_1,
      addr.address_2,
      `${addr.city || ''}${addr.state ? ', ' + addr.state : ''} ${addr.postcode || ''}`.trim(),
      addr.country,
      addr.phone,
    ];

    // Always show email for billing address
    if (addr.email) {
      lines.push(`Email: ${addr.email}`);
    }

    return lines.filter(line => line && line.trim() !== '');
  };

  const AddressDisplay = ({ addr }: { addr: Address | null }) => {
    const lines = addrLines(addr);

    return (
      <>
        {lines.length === 0 ? (
          <Text style={styles.addrLine}>No address saved</Text>
        ) : (
          lines.map((line, index) => (
            <Text key={`addr-${index}-${line.substring(0, 10)}`} style={styles.addrLine}>
              {line}
            </Text>
          ))
        )}
      </>
    );
  };

  // Updated placeOrder function (same as before, just using the new state structure)
  const placeOrder = async () => {
    console.log('=== PLACE ORDER STARTED ===');

    if (!userId) {
      console.error('❌ No userId found');
      showToast('User session expired. Please login again');
      return;
    }

    if (cartItems.length === 0) {
      console.error('❌ Cart is empty');
      showToast('Your cart is empty');
      return;
    }

    if (!selectedPaymentMethod) {
      console.error('❌ No payment method selected');
      showToast('Please select a payment method');
      return;
    }

    const selectedMethod = availablePaymentMethods.find(m => m.method === selectedPaymentMethod);
    if (!selectedMethod || !selectedMethod.enabled) {
      console.error('❌ Selected payment method not available or disabled');
      showToast('Selected payment method is not available');
      return;
    }

    const shippingError = validateAddress(shipping, 'Shipping');
    if (shippingError) {
      showToast(shippingError);
      return;
    }

    const billingError = validateAddress(billing, 'Billing');
    if (billingError) {
      showToast(billingError);
      return;
    }

    setPlacingOrder(true);
    let wooCommerceOrderId: number | null = null;

    try {
      // Derived totals
      const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const saleDiscount = cartItems.reduce(
        (s, it) => s + Math.max(it.originalPrice - it.price, 0) * it.quantity,
        0
      );
      const couponDiscount = calcCouponDiscount(subtotal, appliedCoupons);
      const shippingTotal = shippingLines.reduce((total, line) => total + toNum(line.total), 0);
      const itemTaxTotal = taxCalculation.tax_total || 0;
      const shippingTaxTotal = taxCalculation.shipping_tax_total || 0;
      const totalTax = itemTaxTotal + shippingTaxTotal;
      const total = subtotal - couponDiscount + shippingTotal + totalTax;

      // 🧾 Handle COD Orders Immediately
      if (selectedPaymentMethod === 'cod') {
        Alert.alert(
          'Confirm Order',
          'Do you want to continue to order this product?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Continue',
              onPress: async () => {
                console.log('💰 COD Order - Creating WooCommerce Order...');

                const orderPayload = {
                  customer_id: userId,
                  payment_method: selectedPaymentMethod,
                  payment_method_title: selectedMethod.gateway.title,
                  set_paid: false,
                  status: 'processing',
                  billing,
                  shipping,
                  line_items: cartItems.map(item => ({
                    product_id: Number(item.id),
                    quantity: item.quantity,
                  })),
                  shipping_lines: shippingLines.map(line => ({
                    method_id: line.method_id,
                    method_title: line.method_title,
                    total: line.total,
                  })),
                  meta_data: appliedCoupons.length > 0 ? [{
                    key: 'applied_coupons',
                    value: appliedCoupons
                  }] : [],
                };

                const wooOrder = await createOrder(orderPayload);
                const wooCommerceOrderId = wooOrder.id;
                console.log('✅ COD WooCommerce Order Created. ID:', wooCommerceOrderId);

                if (params.buyNow !== 'true') {
                  await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: [] }] });
                  console.log('✅ Cart cleared');
                }

                showToast('COD order placed successfully!');
                router.replace({
                  pathname: '/pages/orderHistory/orderHistory',
                  params: { orderId: wooOrder.id.toString() },
                });
              },
            },
          ],
          { cancelable: true }
        );

        return; // ✅ Important: prevent continuing to Razorpay section
      }


      // 💳 Handle Online Payment First
      console.log('💳 Creating Razorpay Order...');

      const amountInPaise = Math.round(total);
      const razorpayOrderPayload = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `rcpt_${userId}_${Date.now()}`,
        notes: {
          customer_id: userId.toString(),
        },
      };

      const razorpayOrder = await createRazorpayOrder(razorpayOrderPayload);
      if (!razorpayOrder?.success) throw new Error('Failed to create Razorpay order');

      const razorpayOrderId = razorpayOrder.razorpay_order_id;
      console.log('✅ Razorpay Order ID:', razorpayOrderId);

      const cleanPhone = billing?.phone?.replace(/\D/g, '') || '';
      const validPhone = cleanPhone.length === 10 ? cleanPhone : '';
      const validEmail = billing?.email && validateEmail(billing.email)
        ? billing.email
        : '';
      const fullName = `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim();

      const prefillData: any = {};
      if (validEmail) prefillData.email = validEmail;
      if (validPhone) prefillData.contact = validPhone;
      if (fullName) prefillData.name = fullName;

      const options = {
        description: `Order function called`,
        image: 'https://youlite.in/wp-content/uploads/2022/06/short-logo.png',
        currency: 'INR',
        key: razorpayOrder.key_id || 'rzp_live_Rd7weWo8FeoLOm',
        amount: amountInPaise,
        name: 'YouLite Store',
        order_id: razorpayOrderId || '', // ✅ fixed here
        prefill: prefillData,
        theme: { color: Colors.PRIMARY },
        notes: {
          customer_id: userId.toString(),
        },
      };


      console.log('🚀 Opening Razorpay Checkout...');
      RazorpayCheckout.open(options).then(async (paymentData) => {
        console.log('✅ Payment Success:', paymentData);

        // ✅ NOW Create WooCommerce Order after payment
        console.log('📦 Creating WooCommerce Order (Post-Payment)...');

        const orderPayload = {
          customer_id: userId,
          payment_method: selectedPaymentMethod,
          payment_method_title: selectedMethod.gateway.title,
          set_paid: true,
          status: 'processing',
          billing,
          shipping,
          line_items: cartItems.map(item => ({
            product_id: Number(item.id),
            quantity: item.quantity,
          })),
          shipping_lines: shippingLines.map(line => ({
            method_id: line.method_id,
            method_title: line.method_title,
            total: line.total,
          })),
          meta_data: [
            ...(appliedCoupons.length > 0 ? [{ key: 'applied_coupons', value: appliedCoupons }] : []),
            { key: 'razorpay_payment_id', value: paymentData.razorpay_payment_id },
          ],
        };

        const wooOrder = await createOrder(orderPayload);
        wooCommerceOrderId = wooOrder.id;
        console.log('✅ WooCommerce Order Created after payment. ID:', wooCommerceOrderId);

        // Clear cart
        if (params.buyNow !== 'true') {
          await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: [] }] });
          console.log('✅ Cart cleared');
        }

        showToast('Order placed successfully!');
        router.replace({
          pathname: '/pages/orderHistory/orderHistory',
          params: { orderId: wooOrder.id.toString() }
        });

      }).catch((error) => {
        console.error('❌ RAZORPAY PAYMENT ERROR:', error);
        showToast('Payment failed or cancelled');
      });

    } catch (error: any) {
      console.error('❌ ORDER ERROR:', error);
      showToast(error.message || 'Failed to place order');
    } finally {
      setPlacingOrder(false);
      console.log('=== PLACE ORDER ENDED ===');
    }
  };



  // Derived totals
  const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const saleDiscount = cartItems.reduce(
    (s, it) => s + Math.max(it.originalPrice - it.price, 0) * it.quantity,
    0
  );
  const couponDiscount = calcCouponDiscount(subtotal, appliedCoupons);
  const shippingTotal = shippingLines.reduce((total, line) => total + toNum(line.total), 0);

  // Tax calculations
  const itemTaxTotal = taxCalculation.tax_total || 0;
  const shippingTaxTotal = taxCalculation.shipping_tax_total || 0;
  const totalTax = itemTaxTotal + shippingTaxTotal;

  // Calculate GST breakdown
  const gstBreakdown = calculateGSTBreakdown(taxCalculation);

  const total = subtotal - couponDiscount + shippingTotal + totalTax;

  const getSelectedMethodDetails = () => {
    return availablePaymentMethods.find(m => m.method === selectedPaymentMethod);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <Animated.View style={animatedStyle}>
          <Loading />
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* MAIN SCROLL */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          <View>

            {/* ORDER ITEMS */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Order Items</Text>
              {cartItems.length === 0 ? (
                <Text style={{ color: '#666' }}>Your cart is empty</Text>
              ) : (
                cartItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.itemRow}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: '/pages/DetailsOfItem/ItemDetails',
                        params: {
                          id: item.id,
                          title: item.name,
                        },
                      })
                    }
                  >
                    <Image source={item.image} style={styles.itemImg} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.qtyTxt}>Qty: {item.quantity} | Size: {item.size} | Color: {item.color}</Text>
                    </View>
                    <Text style={styles.priceTxt}>
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* PAYMENT METHOD SECTION */}
            {availablePaymentMethods.length > 0 && (
              <View style={styles.paymentMethodSection}>
                <Text style={styles.sectionTitle}>Select Payment Method</Text>
                {availablePaymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.method}
                    style={[
                      styles.paymentMethodOption,
                      selectedPaymentMethod === method.method && styles.selectedPaymentMethod,
                      !method.enabled && styles.disabledPaymentMethod
                    ]}
                    onPress={() => {
                      if (method.enabled) {
                        setSelectedPaymentMethod(method.method);
                      }
                    }}
                    disabled={!method.enabled}
                  >
                    <View style={styles.paymentMethodRadio}>
                      {selectedPaymentMethod === method.method && (
                        <View style={styles.paymentMethodRadioSelected} />
                      )}
                    </View>
                    <View style={styles.paymentMethodInfo}>
                      <View style={styles.paymentMethodHeader}>
                        <Ionicons
                          name={method.method === 'cod' ? 'cash' : 'card'}
                          size={20}
                          color={method.enabled ? Colors.PRIMARY : '#999'}
                        />
                        <Text style={[
                          styles.paymentMethodTitle,
                          !method.enabled && styles.disabledText
                        ]}>
                          {method.gateway.title}
                          {!method.enabled && ' (Not Available)'}
                        </Text>
                      </View>
                      <Text style={[
                        styles.paymentMethodDescription,
                        !method.enabled && styles.disabledText
                      ]}>
                        {method.description}
                      </Text>
                      {method.method === 'cod' && method.enabled && (
                        <View style={styles.codBadge}>
                          <Text style={styles.codBadgeText}>Pay on Delivery</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* SHIPPING METHODS */}
            {shippingLoading ? (
              <View style={styles.loadingSection}>
                <ActivityIndicator size="small" color={Colors.PRIMARY} />
                <Text style={styles.loadingText}>Loading shipping methods...</Text>
              </View>
            ) : shippingMethods.length > 0 ? (
              <View style={styles.shippingMethodsSection}>
                <Text style={styles.sectionTitle}>Choose Shipping Method</Text>
                {shippingMethods.map((method) => (
                  <TouchableOpacity
                    key={method.instance_id}
                    style={[
                      styles.shippingMethodOption,
                      selectedShippingMethod?.instance_id === method.instance_id && styles.selectedShippingMethod
                    ]}
                    onPress={() => {
                      setSelectedShippingMethod(method);
                      const shippingData = calculateShippingLines([method], cartItems);
                      setShippingLines(shippingData);
                      updateTaxCalculation(cartItems, shippingData);
                    }}
                  >
                    <View style={styles.shippingMethodRadio}>
                      {selectedShippingMethod?.instance_id === method.instance_id && (
                        <View style={styles.shippingMethodRadioSelected} />
                      )}
                    </View>
                    <View style={styles.shippingMethodInfo}>
                      <Text style={styles.shippingMethodTitle}>{method.settings.title.value}</Text>
                      <Text style={styles.shippingMethodDescription}>
                        {method.method_description.replace(/<[^>]*>/g, '')}
                      </Text>
                    </View>
                    <Text style={styles.shippingMethodCost}>
                      ₹{calculateShippingCost(method, cartItems).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.infoSection}>
                <Text style={styles.infoText}>Free Shipping</Text>
                <Text style={styles.freeShippingText}>No additional shipping cost</Text>
              </View>
            )}

            {/* APPLIED COUPONS */}
            {appliedCoupons.length > 0 && (
              <View style={styles.couponSection}>
                <Text style={styles.sectionTitle}>Applied Coupons</Text>
                {appliedCoupons.map((c) => (
                  <View key={c.code} style={styles.couponItem}>
                    <Ionicons name="pricetag" size={18} color={Colors.PRIMARY} style={styles.couponIcon} />
                    <Text style={styles.couponCode}>{c.code.toUpperCase()}</Text>
                    <Text style={styles.couponDiscount}>-₹{toNum(c.amount).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* TAX BREAKDOWN */}
            {taxLoading ? (
              <View style={styles.loadingSection}>
                <ActivityIndicator size="small" color={Colors.PRIMARY} />
                <Text style={styles.loadingText}>Loading tax information...</Text>
              </View>
            ) : taxRates.length > 0 ? (
              <View style={styles.taxSection}>
                {gstBreakdown.total > 0 && (
                  <>
                    <View style={styles.gstBreakdownHeader}>
                      <Text style={styles.gstBreakdownTitle}>GST Breakdown</Text>
                    </View>
                    <View style={styles.taxItem}>
                      <Ionicons name="business" size={16} color={Colors.PRIMARY} style={styles.taxIcon} />
                      <Text style={styles.taxLabel}>CGST</Text>
                      <Text style={styles.taxAmount}>₹{gstBreakdown.cgst.toFixed(2)}</Text>
                    </View>
                    <View style={styles.taxItem}>
                      <Ionicons name="business" size={16} color={Colors.PRIMARY} style={styles.taxIcon} />
                      <Text style={styles.taxLabel}>SGST</Text>
                      <Text style={styles.taxAmount}>₹{gstBreakdown.sgst.toFixed(2)}</Text>
                    </View>
                    {gstBreakdown.igst > 0 && (
                      <View style={styles.taxItem}>
                        <Ionicons name="business" size={16} color={Colors.PRIMARY} style={styles.taxIcon} />
                        <Text style={styles.taxLabel}>IGST</Text>
                        <Text style={styles.taxAmount}>₹{gstBreakdown.igst.toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={styles.totalTaxRow}>
                      <Text style={styles.totalTaxLabel}>Total Tax</Text>
                      <Text style={styles.totalTaxAmount}>₹{gstBreakdown.total.toFixed(2)}</Text>
                    </View>
                  </>
                )}
              </View>
            ) : null}

            {/* ADDRESS SECTION - SINGLE BILLING ADDRESS */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Billing Address</Text>


              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => setEditAddress((p) => !p)}
              >
                <Text style={styles.editTxt}>
                  {editAddress ? 'Cancel' : 'Edit Address'}
                </Text>
              </TouchableOpacity>

              {!editAddress ? (
                <AddressDisplay addr={billing} />
              ) : (
                <>
                  {billing && addressFields.map(([field, placeholder, keyboardType]) => (
                    <AddressInput
                      key={field}
                      field={field}
                      placeholder={placeholder}
                      value={billing[field] || ''}
                      onChangeText={(text) => handleBillingChange(field, text)}
                      keyboardType={keyboardType}
                      error={getInputError(billing, field)}
                    />
                  ))}
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={saveAddress}
                  >
                    <Text style={styles.saveTxt}>Save Address</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* SUMMARY */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Order Summary</Text>
              <View style={styles.summaryRow}>
                <Text>Subtotal</Text>
                <Text>₹{subtotal.toLocaleString()}</Text>
              </View>

              {couponDiscount > 0 && (
                <View style={styles.summaryRow}>
                  <Text>Coupon Discount</Text>
                  <Text style={styles.discountValue}>-₹{couponDiscount.toFixed(2)}</Text>
                </View>
              )}

              <View style={styles.summaryRow}>
                <Text>Delivery</Text>
                <Text>
                  {shippingTotal === 0 ? 'FREE' : `₹${shippingTotal.toLocaleString()}`}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text>Tax</Text>
                <Text>₹{totalTax.toFixed(2)}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>₹{total.toLocaleString()}</Text>
              </View>

              {selectedPaymentMethod && (
                <View style={styles.paymentSummary}>
                  <Text style={styles.paymentSummaryLabel}>Payment Method:</Text>
                  <Text style={styles.paymentSummaryValue}>
                    {getSelectedMethodDetails()?.gateway.title}
                    {selectedPaymentMethod === 'cod' && ' (Pay on Delivery)'}
                  </Text>
                </View>
              )}
            </View>
          </View>

        </ScrollView>

        {/* Bottom button with safe area insets */}
        <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[
              styles.placeBtn,
              (placingOrder || cartItems.length === 0 || !selectedPaymentMethod) && { opacity: 0.5 }
            ]}
            onPress={placeOrder}
            disabled={placingOrder || cartItems.length === 0 || !selectedPaymentMethod}
          >
            {placingOrder ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.placeTxt}>
                {selectedPaymentMethod === 'cod'
                  ? `Place COD Order - ₹${total.toLocaleString()}`
                  : `Pay ₹${total.toLocaleString()}`
                }
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {toast && (
          <View style={[styles.toast, { bottom: Math.max(insets.bottom, 16) + 70 }]}>
            <Text style={styles.toastTxt}>{toast}</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

export default Checkout;

