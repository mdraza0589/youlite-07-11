import imagePath from '@/constant/imagePath';
import { getProductDetail } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinkProps, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

/* ------------------------------ Types ------------------------------ */
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

/* -------------------- Shipping Calculation Functions -------------------- */
const calculateShippingCost = (shippingMethod: ShippingMethod, cartItems: CartItem[]): number => {
  const costFormula = shippingMethod.settings.cost.value;

  // Parse the cost formula
  if (costFormula.includes('[qty]')) {
    // Calculate based on quantity
    const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const baseCost = costFormula.replace('[qty]', totalQuantity.toString());
    try {
      // Simple evaluation for formulas like "10 * [qty]"
      return eval(baseCost);
    } catch (error) {
      console.error('Error evaluating shipping cost formula:', error);
      return toNum(shippingMethod.settings.cost.value);
    }
  } else if (costFormula.includes('[cost]')) {
    // Calculate based on total cost
    const totalCost = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const baseCost = costFormula.replace('[cost]', totalCost.toString());
    try {
      return eval(baseCost);
    } catch (error) {
      console.error('Error evaluating shipping cost formula:', error);
      return toNum(shippingMethod.settings.cost.value);
    }
  } else {
    // Fixed cost
    return toNum(shippingMethod.settings.cost.value);
  }
};

/* -------------------- Tax Calculation Functions -------------------- */
const calculateTaxes = (
  cartItems: CartItem[],
  subtotal: number,
  shippingTotal: number,
  taxRates: TaxRate[]
): TaxCalculation => {
  let tax_total = 0;
  let shipping_tax_total = 0;
  const tax_lines: TaxCalculation['tax_lines'] = [];

  // Group items by tax class
  const itemsByTaxClass: { [key: string]: { subtotal: number; items: CartItem[] } } = {};

  cartItems.forEach(item => {
    const taxClass = item.tax_class || 'standard';
    if (!itemsByTaxClass[taxClass]) {
      itemsByTaxClass[taxClass] = { subtotal: 0, items: [] };
    }
    itemsByTaxClass[taxClass].subtotal += item.price * item.quantity;
    itemsByTaxClass[taxClass].items.push(item);
  });

  // Calculate tax for each tax class
  Object.entries(itemsByTaxClass).forEach(([taxClass, { subtotal: classSubtotal }]) => {
    const applicableRates = taxRates.filter(rate =>
      rate.class === taxClass || (taxClass === 'standard' && rate.class === '')
    );

    applicableRates.forEach(rate => {
      const ratePercent = toNum(rate.rate);
      const item_tax = (classSubtotal * ratePercent) / 100;

      // Calculate shipping tax if applicable
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

/* -------------------- Calculate GST Breakdown -------------------- */
const calculateGSTBreakdown = (taxCalculation: TaxCalculation | null) => {
  if (!taxCalculation) return { cgst: 0, sgst: 0, igst: 0, total: 0 };

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  taxCalculation.tax_lines.forEach(taxLine => {
    // For GST in India, typically split CGST and SGST for intra-state, IGST for inter-state
    // Assuming all transactions are intra-state for now (split 50-50 for CGST/SGST)
    const halfTax = taxLine.tax_total / 2;
    cgst += halfTax;
    sgst += halfTax;

    // For shipping tax, also split equally
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
const determinePaymentMethod = (cartItems: CartItem[], paymentGateways: PaymentGateway[]) => {
  // Get enabled payment gateways
  const enabledGateways = paymentGateways.filter(gateway => gateway.enabled);

  // Check if all products support COD
  const allProductsSupportCOD = cartItems.every(item =>
    item.payment_methods?.includes('cod') || !item.payment_methods || item.payment_methods.length === 0
  );

  // Find COD gateway
  const codGateway = enabledGateways.find(gateway => gateway.id === 'cod');
  const razorpayGateway = enabledGateways.find(gateway => gateway.id === 'razorpay');

  if (allProductsSupportCOD && codGateway) {
    return {
      method: 'cod',
      gateway: codGateway,
      description: 'Cash on delivery - Pay with cash upon delivery.'
    };
  } else if (razorpayGateway) {
    return {
      method: 'razorpay',
      gateway: razorpayGateway,
      description: 'Credit Card/Debit Card/NetBanking - Secure online payment'
    };
  } else if (codGateway) {
    // Fallback to COD if available
    return {
      method: 'cod',
      gateway: codGateway,
      description: 'Cash on delivery - Pay with cash upon delivery.'
    };
  }

  return null;
};

/* =================================================================== */
const Cart: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string>('');
  const [busyQty, setBusyQty] = useState<Record<string, boolean>>({});
  const [busyRemove, setBusyRemove] = useState<Record<string, boolean>>({});
  const [isSummaryVisible, setIsSummaryVisible] = useState(true);
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCouponMeta[]>([]);
  const [busyCoupon, setBusyCoupon] = useState<Record<string, boolean>>({});
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod | null>(null);
  const [shippingLines, setShippingLines] = useState<ShippingLine[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculation | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<{
    method: string;
    gateway: PaymentGateway;
    description: string;
  } | null>(null);

  // Animation values
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

  /* -------------------- Load Tax Rates -------------------- */
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

  /* -------------------- Load Shipping Methods -------------------- */
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
      // Filter only enabled methods
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

  /* -------------------- Calculate Shipping Lines -------------------- */
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

  /* -------------------- Select Default Flat Rate Shipping Method -------------------- */
  const selectDefaultFlatRateMethod = (methods: ShippingMethod[], items: CartItem[]): ShippingMethod | null => {
    if (!methods.length) return null;

    // Always prioritize flat_rate if available and enabled
    const flatRateMethod = methods.find(method => method.method_id === 'flat_rate' && method.enabled);
    if (flatRateMethod) return flatRateMethod;

    // Fallback to first enabled method
    return methods.find(method => method.enabled) || null;
  };

  /* -------------------- Update Tax Calculation -------------------- */
  const updateTaxCalculation = (
    items: CartItem[] = cartItems,
    shipping: ShippingLine[] = shippingLines,
    rates: TaxRate[] = taxRates
  ) => {
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const shippingTotal = shipping.reduce((total, line) => total + toNum(line.total), 0);

    if (rates.length > 0) {
      const taxCalc = calculateTaxes(items, subtotal, shippingTotal, rates);
      console.log('Updated Tax Calculation:', taxCalc);
      setTaxCalculation(taxCalc);
    } else {
      setTaxCalculation(null);
    }
  };

  // Auto-update tax calculation whenever dependencies change
  useEffect(() => {
    if (cartItems.length > 0 || taxRates.length > 0 || shippingLines.length > 0) {
      updateTaxCalculation(cartItems, shippingLines, taxRates);
    }
  }, [taxRates, cartItems, shippingLines]);

  // Update payment method when cart items or payment gateways change
  useEffect(() => {
    if (cartItems.length > 0 && paymentGateways.length > 0) {
      const paymentMethod = determinePaymentMethod(cartItems, paymentGateways);
      setSelectedPaymentMethod(paymentMethod);
    }
  }, [cartItems, paymentGateways]);

  /* -------------------- Load Cart -------------------- */
  const loadCart = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const session = await getSession();
      if (!session?.user?.id) {
        setErrorText('Please log in to view your cart.');
        setCartItems([]);
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      // Load tax rates, shipping methods, and payment gateways in parallel
      const [rates, methods, gateways] = await Promise.all([
        loadTaxRates(),
        loadShippingMethods(),
        loadPaymentGateways()
      ]);

      setTaxRates(rates);
      setShippingMethods(methods);
      setPaymentGateways(gateways);

      const customer = await getCustomerById(session.user.id);
      const cartMeta = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      const couponsMeta = customer?.meta_data?.find((m: any) => m.key === 'applied_coupons')?.value || [];
      setAppliedCoupons(Array.isArray(couponsMeta) ? couponsMeta : []);

      const fetched: CartItem[] = [];
      for (const entry of cartMeta) {
        const { id, quantity } = entry;
        const detailRes = await getProductDetail(id);
        const productData = detailRes?.data;
        if (!productData) continue;

        const attrs = Array.isArray(productData.attributes) ? productData.attributes : [];
        const color = attrs.find((a: any) => a?.name?.toLowerCase().includes('color'))?.options?.[0] || 'N/A';
        const size = attrs.find((a: any) => a?.name?.toLowerCase().includes('size'))?.options?.[0] || 'N/A';

        // Determine payment methods for this product
        // For now, we'll assume all products support both methods unless specified otherwise
        // In a real app, this would come from product meta data
        const payment_methods = ['cod', 'razorpay']; // Default to supporting both

        fetched.push({
          id: String(productData.id),
          name: productData.name || 'Unnamed',
          price: toNum(productData.sale_price ?? productData.price, 0),
          originalPrice: toNum(productData.regular_price ?? productData.price, 0),
          size,
          color,
          image: { uri: productData.images?.[0]?.src || 'https://via.placeholder.com/100' },
          quantity: quantity || 1,
          tax_class: productData.tax_class || 'standard',
          tax_status: productData.tax_status || 'taxable',
          payment_methods,
        });
      }

      setCartItems(fetched);

      // Calculate and set shipping with default flat_rate
      if (methods.length > 0 && fetched.length > 0) {
        const defaultMethod = selectDefaultFlatRateMethod(methods, fetched);
        setSelectedShippingMethod(defaultMethod);

        const shippingData = defaultMethod
          ? calculateShippingLines([defaultMethod], fetched)
          : [];
        setShippingLines(shippingData);

        // Update tax calculation with shipping data and freshly loaded rates
        updateTaxCalculation(fetched, shippingData, rates);
      } else {
        updateTaxCalculation(fetched, [], rates);
      }

      // Determine payment method
      const paymentMethod = determinePaymentMethod(fetched, gateways);
      setSelectedPaymentMethod(paymentMethod);

    } catch (err) {
      console.error('Cart load error:', (err as any)?.message || err);
      setErrorText('Failed to load cart. Please try again.');
      setCartItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [loadCart])
  );

  /* -------------------- Update Shipping Method -------------------- */
  const updateShippingMethod = async (method: ShippingMethod) => {
    setSelectedShippingMethod(method);

    const shippingData = calculateShippingLines([method], cartItems);
    setShippingLines(shippingData);

    updateTaxCalculation(cartItems, shippingData, taxRates);
  };

  /* -------------------- Meta Update -------------------- */
  const updateCartMeta = async (items: CartItem[]) => {
    if (!userId) return;
    const meta = items.map((it) => ({ id: it.id, quantity: it.quantity }));
    try {
      await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: meta }] });

      // Recalculate shipping with default flat_rate and update tax
      if (shippingMethods.length > 0) {
        const defaultMethod = selectDefaultFlatRateMethod(shippingMethods, items);
        setSelectedShippingMethod(defaultMethod);

        const shippingData = defaultMethod
          ? calculateShippingLines([defaultMethod], items)
          : [];
        setShippingLines(shippingData);
        updateTaxCalculation(items, shippingData, taxRates);
      } else {
        updateTaxCalculation(items, [], taxRates);
      }

      // Update payment method
      const paymentMethod = determinePaymentMethod(items, paymentGateways);
      setSelectedPaymentMethod(paymentMethod);
    } catch (e) {
      console.error('Cart meta update error', e);
    }
  };

  /* -------------------- Quantity & Remove -------------------- */
  const updateQuantity = async (id: string, qty: number) => {
    if (qty < 1) return;
    setBusyQty((p) => ({ ...p, [id]: true }));
    const updated = cartItems.map((it) => (it.id === id ? { ...it, quantity: qty } : it));
    setCartItems(updated);
    await updateCartMeta(updated);
    setBusyQty((p) => ({ ...p, [id]: false }));
  };

  const removeItem = async (id: string) => {
    setBusyRemove((p) => ({ ...p, [id]: true }));
    const updated = cartItems.filter((it) => it.id !== id);
    setCartItems(updated);
    await updateCartMeta(updated);
    setBusyRemove((p) => ({ ...p, [id]: false }));
  };

  /* -------------------- Coupon remove -------------------- */
  const removeCoupon = async (code: string) => {
    if (!userId) return;
    setBusyCoupon((p) => ({ ...p, [code]: true }));
    const newList = appliedCoupons.filter((c) => c.code !== code);
    const customer = await getCustomerById(userId);
    const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
    const newMeta = meta.filter((m: any) => m.key !== 'applied_coupons');
    newMeta.push({ key: 'applied_coupons', value: newList });
    await updateCustomerById(userId, { meta_data: newMeta });
    setAppliedCoupons(newList);
    setBusyCoupon((p) => ({ ...p, [code]: false }));
  };

  /* -------------------- Checkout Handler -------------------- */
  const handleCheckout = () => {
    if (!selectedPaymentMethod) {
      alert('No payment method available. Please contact support.');
      return;
    }

    // Prepare checkout data
    const checkoutData = {
      cartItems,
      subtotal,
      couponDiscount,
      shippingTotal,
      totalTax,
      total,
      shippingMethod: selectedShippingMethod,
      paymentMethod: selectedPaymentMethod,
      appliedCoupons,
      taxCalculation,
    };

    console.log('Proceeding to checkout with:', checkoutData);

    // Navigate to checkout with the determined payment method
    router.push({
      pathname: '/pages/Checkout/Checkout',
      params: {
        paymentMethod: selectedPaymentMethod.method,
        total: total.toString(),
        cartData: JSON.stringify(checkoutData)
      }
    });
  };

  /* -------------------- Derived totals -------------------- */
  const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const saleDiscount = cartItems.reduce(
    (s, it) => s + Math.max(it.originalPrice - it.price, 0) * it.quantity,
    0
  );
  const couponDiscount = calcCouponDiscount(subtotal, appliedCoupons);
  const shippingTotal = shippingLines.reduce((total, line) => total + toNum(line.total), 0);

  // Tax calculations
  const itemTaxTotal = taxCalculation?.tax_total || 0;
  const shippingTaxTotal = taxCalculation?.shipping_tax_total || 0;
  const totalTax = itemTaxTotal + shippingTaxTotal;

  // Calculate GST breakdown
  const gstBreakdown = calculateGSTBreakdown(taxCalculation);

  const total = subtotal - couponDiscount + shippingTotal + totalTax;

  /* -------------------- Loading -------------------- */
  if (loading) {
    return (
      <View style={styles.loader}>
        <Animated.View style={animatedStyle}>
          <Image
            source={imagePath.loader}
            style={styles.loaderImage}
          />
        </Animated.View>
        <Text style={styles.loaderText}>Loading your cart...</Text>
      </View>
    );
  }

  /* -------------------- JSX -------------------- */
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        <Text style={styles.cartCountText}>{cartItems.length} items</Text>
      </View>

      {/* Quick links */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/pages/orderHistory/orderHistory')}>
          <Ionicons name="receipt-outline" size={20} color={Colors.PRIMARY} />
          <Text style={styles.optionText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/pages/AddToCart/Coupons')}>
          <Ionicons name="pricetag-outline" size={20} color={Colors.PRIMARY} />
          <Text style={styles.optionText}>Coupons</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/pages/AddToCart/Help')}>
          <Ionicons name="help-circle-outline" size={20} color={Colors.PRIMARY} />
          <Text style={styles.optionText}>Help</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/(tabs)/Category')}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.PRIMARY} />
          <Text style={styles.optionText}>Add More</Text>
        </TouchableOpacity>
      </View>

      {errorText ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorText}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCart}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : cartItems.length === 0 ? (
        /* Empty cart */
        <View style={styles.emptyCart}>
          <Ionicons name="cart-outline" size={80} color="#ddd" />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <Text style={styles.emptySubtext}>Browse our products and start adding items!</Text>
          <TouchableOpacity style={styles.shopButton} onPress={() => router.push('/(tabs)/Category')}>
            <Text style={styles.shopButtonText}>Shop Now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Items */}
          <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
            {cartItems.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/pages/DetailsOfItem/ItemDetails',
                      params: { id: item.id, title: item.name },
                    })
                  }
                  style={styles.imageContainer}
                >
                  <Image source={item.image} style={styles.itemImage} />
                </TouchableOpacity>

                <View style={styles.itemDetails}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemSizeColor}>
                    Size: {item.size} | Color: {item.color}
                  </Text>

                  <View style={styles.priceContainer}>
                    <Text style={styles.itemPrice}>₹{item.price.toLocaleString()}</Text>
                    {item.originalPrice > item.price && (
                      <>
                        <Text style={styles.originalPrice}>
                          ₹{item.originalPrice.toLocaleString()}
                        </Text>
                        <Text style={styles.discountText}>
                          {Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)}% OFF
                        </Text>
                      </>
                    )}
                  </View>

                  <View style={styles.quantityContainer}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(item.id, item.quantity - 1)}
                      style={styles.quantityButton}
                      disabled={busyQty[item.id] || item.quantity <= 1}
                    >
                      {busyQty[item.id] ? (
                        <ActivityIndicator size={16} color={Colors.PRIMARY} />
                      ) : (
                        <Ionicons name="remove" size={20} color="#333" />
                      )}
                    </TouchableOpacity>

                    <Text style={styles.quantityText}>{item.quantity}</Text>

                    <TouchableOpacity
                      onPress={() => updateQuantity(item.id, item.quantity + 1)}
                      style={styles.quantityButton}
                      disabled={busyQty[item.id]}
                    >
                      {busyQty[item.id] ? (
                        <ActivityIndicator size={16} color={Colors.PRIMARY} />
                      ) : (
                        <Ionicons name="add" size={20} color="#333" />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                      style={styles.removeButton}
                      disabled={busyRemove[item.id]}
                    >
                      {busyRemove[item.id] ? (
                        <ActivityIndicator size={14} color="#ff3f6c" />
                      ) : (
                        <Text style={styles.removeText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}

            {/* Shipping Methods Section */}
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
                    onPress={() => updateShippingMethod(method)}
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
                <Text style={styles.infoText}>No shipping methods available</Text>
              </View>
            )}

            {/* Payment Method Section */}
            {/* {selectedPaymentMethod && (
              <View style={styles.paymentMethodSection}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                <View style={styles.paymentMethodCard}>
                  <View style={styles.paymentMethodHeader}>
                    <Ionicons 
                      name={selectedPaymentMethod.method === 'cod' ? 'cash' : 'card'} 
                      size={24} 
                      color={Colors.PRIMARY} 
                    />
                    <Text style={styles.paymentMethodTitle}>
                      {selectedPaymentMethod.gateway.title}
                    </Text>
                  </View>
                  <Text style={styles.paymentMethodDescription}>
                    {selectedPaymentMethod.description}
                  </Text>
                  {selectedPaymentMethod.method === 'cod' && (
                    <View style={styles.codBadge}>
                      <Text style={styles.codBadgeText}>Pay on Delivery</Text>
                    </View>
                  )}
                </View>
              </View>
            )} */}

            {/* Applied Coupons Section */}
            {appliedCoupons.length > 0 && (
              <View style={styles.couponSection}>
                <Text style={styles.sectionTitle}>Applied Coupons</Text>
                {appliedCoupons.map((c) => (
                  <View key={c.code} style={styles.couponItem}>
                    <Ionicons name="pricetag" size={18} color={Colors.PRIMARY} style={styles.couponIcon} />
                    <Text style={styles.couponCode}>{c.code.toUpperCase()}</Text>
                    <TouchableOpacity
                      disabled={busyCoupon[c.code]}
                      onPress={() => removeCoupon(c.code)}
                      style={styles.removeCouponButton}
                    >
                      {busyCoupon[c.code] ? (
                        <ActivityIndicator size={14} color="#c00" />
                      ) : (
                        <Text style={styles.removeCouponText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Tax Breakdown Section */}
            {taxLoading ? (
              <View style={styles.loadingSection}>
                <ActivityIndicator size="small" color={Colors.PRIMARY} />
                <Text style={styles.loadingText}>Loading tax information...</Text>
              </View>
            ) : taxRates.length > 0 ? (
              <View style={styles.taxSection}>
                {taxCalculation ? (
                  <>
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
                  </>
                ) : (
                  <View style={styles.infoSection}>
                    <Text style={styles.infoText}>Calculating taxes...</Text>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.spacer} />
          </ScrollView>

          {/* Bottom container for summary and checkout */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={styles.toggleHandle}
              onPress={() => setIsSummaryVisible(!isSummaryVisible)}
            >
              <Ionicons
                name={isSummaryVisible ? 'chevron-down' : 'chevron-up'}
                size={24}
                color={Colors.PRIMARY}
              />
            </TouchableOpacity>
            {isSummaryVisible && (
              <View style={styles.summaryContainer}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>₹{subtotal.toLocaleString()}</Text>
                </View>

                {couponDiscount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Coupon Discount</Text>
                    <Text style={[styles.summaryValue, styles.discountValue]}>
                      -₹{couponDiscount.toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery</Text>
                  <Text style={styles.summaryValue}>
                    {shippingTotal === 0 ? 'FREE' : `₹${shippingTotal.toLocaleString()}`}
                  </Text>
                </View>

                {totalTax > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>₹{totalTax.toFixed(2)}</Text>
                  </View>
                )}

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>₹{total.toLocaleString()}</Text>
                </View>

                {/* Payment Method Summary */}
                {selectedPaymentMethod && (
                  <View style={styles.paymentSummary}>
                    <Text style={styles.paymentSummaryLabel}>Payment Method:</Text>
                    <Text style={styles.paymentSummaryValue}>
                      {selectedPaymentMethod.gateway.title}
                      {selectedPaymentMethod.method === 'cod' && ' (Pay on Delivery)'}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={handleCheckout}
            >
              <Text style={styles.checkoutText}>{`Proceed to Checkout (₹${total.toLocaleString()})`}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

export default Cart;

/* ----------------------------- Styles ----------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },

  /* header */
  header: {
    marginBottom: 24,
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: Dimenstion.headerHeight,
  },
  headerButton: { padding: 8 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.WHITE },
  cartCountText: { fontSize: 16, fontWeight: '600', color: Colors.WHITE },

  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loaderImage: { width: 60, height: 60, marginBottom: 12 },
  loaderText: { fontSize: 16, color: '#666' },

  /* quick links */
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  optionButton: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  optionText: { fontSize: 14, color: Colors.PRIMARY, fontWeight: '500', marginTop: 4 },

  /* error */
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#c00', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: Colors.PRIMARY, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },

  /* items list */
  itemsContainer: { flex: 1, paddingHorizontal: 10, paddingTop: 10 },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: { marginRight: 16 },
  itemImage: { width: 100, height: 100, borderRadius: 8 },
  itemDetails: { flex: 1, justifyContent: 'space-between' },
  itemName: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  itemSizeColor: { fontSize: 14, color: '#666', marginBottom: 8 },
  priceContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  itemPrice: { fontSize: 18, fontWeight: 'bold', marginRight: 8 },
  originalPrice: { fontSize: 14, color: '#999', textDecorationLine: 'line-through', marginRight: 8 },
  discountText: { fontSize: 14, color: '#00a650', fontWeight: 'bold' },

  quantityContainer: { flexDirection: 'row', alignItems: 'center' },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  quantityText: { width: 50, textAlign: 'center', fontSize: 18, fontWeight: '600' },
  removeButton: { marginLeft: 'auto', paddingVertical: 8, paddingHorizontal: 12 },
  removeText: { color: '#ff3f6c', fontWeight: 'bold', fontSize: 14 },

  /* loading sections */
  loadingSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  /* shipping methods */
  shippingMethodsSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shippingMethodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedShippingMethod: {
    borderColor: Colors.PRIMARY,
    backgroundColor: '#f0f8ff',
  },
  shippingMethodRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shippingMethodRadioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.PRIMARY,
  },
  shippingMethodInfo: { flex: 1 },
  shippingMethodTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  shippingMethodDescription: { fontSize: 12, color: '#666' },
  shippingMethodCost: { fontSize: 16, fontWeight: 'bold', color: Colors.PRIMARY },

  /* payment method section */
  paymentMethodSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentMethodCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.PRIMARY,
    borderRadius: 8,
    backgroundColor: '#f0f8ff',
  },
  paymentMethodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentMethodTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.PRIMARY,
    marginLeft: 8,
  },
  paymentMethodDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  codBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00a650',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  codBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  /* sections */
  couponSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  taxSection: {
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#333' },

  couponItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  couponIcon: { marginRight: 8 },
  couponCode: { fontSize: 14, fontWeight: '500', flex: 1 },
  removeCouponButton: { paddingHorizontal: 8, paddingVertical: 4 },
  removeCouponText: { color: '#c00', fontSize: 12, fontWeight: 'bold' },

  taxItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  taxIcon: { marginRight: 8 },
  taxLabel: { fontSize: 13, color: '#666', flex: 1 },
  taxAmount: { fontSize: 13, fontWeight: '500' },

  /* GST Breakdown */
  gstBreakdownHeader: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 8,
    paddingTop: 8,
    marginBottom: 6,
  },
  gstBreakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.PRIMARY,
  },
  totalTaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalTaxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalTaxAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.PRIMARY,
  },

  /* bottom container */
  bottomContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    paddingBottom: 12,
  },
  toggleHandle: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 2,
  },

  /* summary */
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 15, color: '#666' },
  summaryValue: { fontSize: 15, fontWeight: '500' },
  discountValue: { color: '#00a650' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  totalLabel: { fontSize: 18, fontWeight: 'bold' },
  totalValue: { fontSize: 20, fontWeight: 'bold', color: Colors.PRIMARY },
  paymentSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  paymentSummaryLabel: { fontSize: 14, color: '#666' },
  paymentSummaryValue: { fontSize: 14, fontWeight: '500', color: Colors.PRIMARY },

  checkoutButton: {
    backgroundColor: Colors.PRIMARY,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  checkoutText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },
  secureText: { textAlign: 'center', fontSize: 12, color: '#666', marginBottom: 0, marginTop: 8 },

  /* empty */
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 22, fontWeight: 'bold', marginTop: 24, marginBottom: 8, color: '#333' },
  emptySubtext: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 },
  shopButton: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  shopButtonText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },

  spacer: { height: 100 },
});