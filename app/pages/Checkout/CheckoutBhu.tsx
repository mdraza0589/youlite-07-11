import { getProductDetail } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { createOrder, createRazorpayOrder, processRazorpayPayment } from '@/lib/services/orderService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
                autoCapitalize={field === 'email' ? 'none' : 'words'}
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
    const [sameAddress, setSameAddress] = useState(false);
    const [activeTab, setActiveTab] = useState<'shipping' | 'billing'>('shipping');
    const [editShipping, setEditShipping] = useState(false);
    const [editBilling, setEditBilling] = useState(false);
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

            console.log('📍 Shipping address:', customer?.shipping);
            console.log('📍 Billing address:', customer?.billing);

            setShipping(customer?.shipping || null);
            setBilling(customer?.billing || null);

            // Load coupons
            const couponsMeta = customer?.meta_data?.find((m: any) => m.key === 'applied_coupons')?.value || [];
            setAppliedCoupons(Array.isArray(couponsMeta) ? couponsMeta : []);

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
                const cartMeta = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
                console.log('Cart meta data:', cartMeta);
                console.log('Cart items count:', cartMeta.length);

                const fetched: CartItem[] = [];
                for (const { id, quantity } of cartMeta) {
                    try {
                        console.log(`Fetching product ${id}...`);
                        const res = await getProductDetail(id);
                        const p = res?.data;
                        if (!p) {
                            console.warn(`Product ${id} not found`);
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
                            quantity: quantity || 1,
                            tax_class: p.tax_class || 'standard',
                            tax_status: p.tax_status || 'taxable',
                            payment_methods,
                        };
                        console.log(`✅ Product ${id} added:`, item);
                        fetched.push(item);
                    } catch (e) {
                        console.error(`❌ Failed to load product ${id}:`, e);
                    }
                }
                console.log('✅ Total cart items loaded:', fetched.length);
                setCartItems(fetched);
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

    const saveAddress = async (type: 'shipping' | 'billing') => {
        if (!userId) return;
        const addr = type === 'shipping' ? shipping : billing;

        const validationError = validateAddress(addr, type);
        if (validationError) {
            showToast(validationError);
            return;
        }

        try {
            await updateCustomerById(userId, { [type]: addr });
            showToast('Address saved successfully');
            type === 'shipping' ? setEditShipping(false) : setEditBilling(false);
        } catch (e) {
            console.error('Save address error', e);
            showToast('Failed to save address');
        }
    };

    // Updated placeOrder function with COD and Razorpay logic
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
            setActiveTab('shipping');
            return;
        }

        const billingError = validateAddress(billing, 'Billing');
        if (billingError) {
            showToast(billingError);
            setActiveTab('billing');
            return;
        }

        setPlacingOrder(true);
        let wooCommerceOrderId: number | null = null;

        try {
            // Step 1: Create WooCommerce Order
            console.log('📦 Creating WooCommerce Order...');

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

            const total = subtotal - couponDiscount + shippingTotal + totalTax;

            const orderPayload = {
                customer_id: userId,
                payment_method: selectedPaymentMethod,
                payment_method_title: selectedMethod.gateway.title,
                set_paid: selectedPaymentMethod === 'cod' ? false : true,
                status: selectedPaymentMethod === 'cod' ? 'processing' : 'pending',
                billing: billing,
                shipping: shipping,
                line_items: cartItems.map((item) => ({
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

            const wooCommerceOrder = await createOrder(orderPayload);

            if (!wooCommerceOrder?.id) {
                throw new Error('Failed to create WooCommerce order');
            }

            wooCommerceOrderId = wooCommerceOrder.id;
            console.log('✅ WooCommerce Order Created. ID:', wooCommerceOrderId);

            // Step 2: Handle COD orders - direct completion
            if (selectedPaymentMethod === 'cod') {
                console.log('💰 COD Order - Completing without payment...');

                // Clear cart for COD orders too
                if (params.buyNow !== 'true') {
                    console.log('🛒 Clearing cart...');
                    await updateCustomerById(userId, {
                        meta_data: [{ key: 'cart', value: [] }]
                    });
                    console.log('✅ Cart cleared');
                }

                showToast('COD order placed successfully!');
                console.log('🎉 COD ORDER COMPLETED!');

                setTimeout(() => {
                    router.replace({
                        pathname: '/pages/orderHistory/orderHistory',
                        params: {
                            orderId: wooCommerceOrder.id.toString()
                        }
                    });
                }, 1500);
                return;
            }

            // Step 3: Handle Razorpay orders - create Razorpay order
            console.log('💳 Creating Razorpay Order...');

            const amountInPaise = Math.round(total * 100); // Convert to paise

            const razorpayOrderPayload = {
                amount: amountInPaise,
                currency: 'INR',
                receipt: `rcpt_${wooCommerceOrder.id}_${Date.now()}`,
                notes: {
                    woo_order_id: wooCommerceOrder.id.toString(),
                    customer_id: userId.toString(),
                }
            };

            console.log('Razorpay Order Payload:', razorpayOrderPayload);
            const razorpayOrder = await createRazorpayOrder(razorpayOrderPayload);

            console.log('Razorpay Order Response:', razorpayOrder);

            if (!razorpayOrder?.success) {
                console.error('❌ Razorpay order creation failed:', razorpayOrder);
                throw new Error('Failed to create Razorpay order');
            }

            const razorpayOrderId = razorpayOrder.razorpay_order_id;

            if (!razorpayOrderId) {
                console.error('❌ No Razorpay order ID in response:', razorpayOrder);
                throw new Error('Invalid Razorpay order response');
            }

            console.log('✅ Razorpay Order ID:', razorpayOrderId);

            // Step 4: Prepare Razorpay Checkout
            console.log('🔐 Preparing Razorpay Checkout...');

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

            console.log('Prefill Data:', prefillData);

            const options = {
                description: `Order #${wooCommerceOrder.id}`,
                image: 'https://youlite.in/wp-content/uploads/2022/06/short-logo.png',
                currency: 'INR',
                key: razorpayOrder.key_id || 'rzp_live_RNs9lqLuduxCWX',
                amount: amountInPaise,
                name: 'YouLite Store',
                order_id: razorpayOrderId,
                prefill: prefillData,
                theme: { color: Colors.PRIMARY },
                notes: {
                    woo_order_id: wooCommerceOrder.id.toString(),
                    customer_id: userId.toString()
                }
            };

            console.log('Razorpay Checkout Options:', {
                ...options,
                key: options.key.substring(0, 10) + '...' // Hide full key in logs
            });

            console.log('🚀 Opening Razorpay Checkout...');

            RazorpayCheckout.open(options).then(async (paymentData) => {
                console.log('✅ Payment Success:', paymentData);

                // Step 5: Verify payment
                console.log('🔍 Verifying payment...');
                const verificationPayload = {
                    order_id: wooCommerceOrder.id,
                    razorpay_payment_id: paymentData.razorpay_payment_id,
                    razorpay_order_id: paymentData.razorpay_order_id,
                    razorpay_signature: paymentData.razorpay_signature
                };

                console.log('Verification Payload:', verificationPayload);
                const verificationResult = await processRazorpayPayment(verificationPayload);

                console.log('✅ Payment verified:', verificationResult);

                // Step 6: Clear cart
                if (params.buyNow !== 'true') {
                    console.log('🛒 Clearing cart...');
                    await updateCustomerById(userId, {
                        meta_data: [{ key: 'cart', value: [] }]
                    });
                    console.log('✅ Cart cleared');
                }

                showToast('Order placed successfully!');
                console.log('🎉 ORDER COMPLETED!');

                setTimeout(() => {
                    router.replace({
                        pathname: '/pages/orderHistory/orderHistory',
                        params: {
                            orderId: wooCommerceOrder.id.toString()
                        }
                    });
                }, 1500);

            }).catch((error) => {
                alert(`Error: ${error.code} | ${error.description}`);
                showToast(error.description || 'Network error. Please check your connection');
            });

        } catch (error: any) {
            console.error('❌ ORDER ERROR:', error);
            console.error('Error stack:', error.stack);

            if (error.code !== undefined) {
                switch (error.code) {
                    case 0:
                        showToast('Network error. Please check your connection');
                        break;
                    case 1:
                        showToast(error.description || 'Payment failed');
                        break;
                    case 2:
                        showToast('Payment cancelled by user');
                        break;
                    default:
                        showToast('Payment error. Please try again');
                }
            } else if (error.description) {
                showToast(error.description);
            } else if (error.message) {
                showToast(error.message);
            } else {
                showToast('Failed to process payment. Please try again');
            }

            if (wooCommerceOrderId) {
                console.log('⚠️ Order created but payment failed. Order ID:', wooCommerceOrderId);
            }
        } finally {
            setPlacingOrder(false);
            console.log('=== PLACE ORDER ENDED ===');
        }
    };

    // FIXED: Separate handlers for shipping and billing
    const handleShippingChange = useCallback((field: keyof Address, value: string) => {
        setShipping(prev => {
            if (!prev) return prev;
            const updated = { ...prev, [field]: value };

            // If same address is enabled, also update billing
            if (sameAddress) {
                setBilling(updated);
            }

            return updated;
        });
    }, [sameAddress]);

    const handleBillingChange = useCallback((field: keyof Address, value: string) => {
        setBilling(prev => prev ? { ...prev, [field]: value } : null);
    }, []);

    const handleSameAddressToggle = useCallback((value: boolean) => {
        setSameAddress(value);
        if (value && shipping) {
            setBilling({ ...shipping });
        }
    }, [shipping]);

    // FIXED: Generate unique keys using index to avoid duplicate key errors
    const addrLines = (addr: Address | null) => {
        if (!addr) return [];

        const lines = [
            `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
            addr.company,
            addr.address_1,
            addr.address_2,
            `${addr.city || ''}${addr.state ? ', ' + addr.state : ''} ${addr.postcode || ''}`.trim(),
            addr.country,
            addr.email,
            addr.phone,
        ].filter(line => line && line.trim() !== '');

        return lines;
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

    // Address field configuration
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
        ['phone', 'Phone* (10 digits)', 'phone-pad'],
    ];

    const renderTabContent = () => {
        const isShipping = activeTab === 'shipping';
        const addr = isShipping ? shipping : billing;
        const isEditing = isShipping ? editShipping : editBilling;
        const handleChange = isShipping ? handleShippingChange : handleBillingChange;

        if (!isEditing) {
            return <AddressDisplay addr={addr} />;
        }

        if (!addr) return null;

        return (
            <>
                {addressFields.map(([field, placeholder, keyboardType]) => (
                    <AddressInput
                        key={field}
                        field={field}
                        placeholder={placeholder}
                        value={addr[field] || ''}
                        onChangeText={(text) => handleChange(field, text)}
                        keyboardType={keyboardType}
                        error={getInputError(addr, field)}
                    />
                ))}
            </>
        );
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
                    <ActivityIndicator size="large" color={Colors.PRIMARY} />
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

                            {/* Payment method restrictions info */}
                            {availablePaymentMethods.some(m => !m.enabled) && (
                                <View style={styles.paymentRestrictionInfo}>
                                    <Ionicons name="information-circle" size={16} color="#666" />
                                    <Text style={styles.paymentRestrictionText}>
                                        Some payment methods are not available due to product restrictions
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* SHIPPING METHODS - Always show with default selected */}
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
                            {selectedShippingMethod && (
                                <View style={styles.selectedShippingInfo}>
                                    <Text style={styles.selectedShippingText}>
                                        Selected: {selectedShippingMethod.settings.title.value} - ₹{shippingTotal.toLocaleString()}
                                    </Text>
                                </View>
                            )}
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

                    {/* TAX BREAKDOWN - Always visible if tax rates loaded */}
                    {taxLoading ? (
                        <View style={styles.loadingSection}>
                            <ActivityIndicator size="small" color={Colors.PRIMARY} />
                            <Text style={styles.loadingText}>Loading tax information...</Text>
                        </View>
                    ) : taxRates.length > 0 ? (
                        <View style={styles.taxSection}>
                            {/* GST Breakdown - Always show if total > 0 */}
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
                            {gstBreakdown.total === 0 && (
                                <View style={styles.totalTaxRow}>
                                    <Text style={styles.totalTaxLabel}>Total Tax</Text>
                                    <Text style={styles.totalTaxAmount}>₹0.00</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.infoSection}>
                            <Text style={styles.infoText}>No tax information available</Text>
                        </View>
                    )}

                    {/* ADDRESS TABS */}
                    <View style={styles.section}>
                        <View style={styles.tabsRow}>
                            {(['shipping', 'billing'] as const).map((tab) => (
                                <TouchableOpacity
                                    key={tab}
                                    style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                                    onPress={() => setActiveTab(tab)}
                                >
                                    <Text
                                        style={[
                                            styles.tabTxt,
                                            activeTab === tab && styles.tabTxtActive,
                                        ]}
                                    >
                                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.checkboxRow}>
                            <Switch
                                value={sameAddress}
                                onValueChange={handleSameAddressToggle}
                                trackColor={{ false: '#ccc', true: Colors.PRIMARY + '77' }}
                                thumbColor={sameAddress ? Colors.PRIMARY : '#f4f3f4'}
                            />
                            <Text style={styles.checkboxLabel}>
                                Billing same as Shipping
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() =>
                                activeTab === 'shipping'
                                    ? setEditShipping((p) => !p)
                                    : setEditBilling((p) => !p)
                            }
                        >
                            <Text style={styles.editTxt}>
                                {(activeTab === 'shipping' ? editShipping : editBilling)
                                    ? 'Cancel'
                                    : 'Edit Address'}
                            </Text>
                        </TouchableOpacity>

                        {renderTabContent()}

                        {((activeTab === 'shipping' && editShipping) ||
                            (activeTab === 'billing' && editBilling)) && (
                                <TouchableOpacity
                                    style={styles.saveBtn}
                                    onPress={() => saveAddress(activeTab)}
                                >
                                    <Text style={styles.saveTxt}>Save</Text>
                                </TouchableOpacity>
                            )}
                    </View>

                    {/* SUMMARY */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Summary</Text>
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

                        {/* Payment Method Summary */}
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

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
    headerTitle: { color: Colors.WHITE, fontSize: 20, fontWeight: 'bold' },

    section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#eee' },
    sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },

    itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    itemImg: { width: 60, height: 60, borderRadius: 6, marginRight: 12 },
    qtyTxt: { fontSize: 12, color: '#666' },
    priceTxt: { fontSize: 14, fontWeight: '600' },

    // Payment Method Section
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
    paymentMethodOption: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        marginBottom: 8,
    },
    selectedPaymentMethod: {
        borderColor: Colors.PRIMARY,
        backgroundColor: '#f0f8ff',
    },
    disabledPaymentMethod: {
        borderColor: '#ddd',
        backgroundColor: '#f9f9f9',
        opacity: 0.6,
    },
    paymentMethodRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#ccc',
        marginRight: 12,
        marginTop: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    paymentMethodRadioSelected: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.PRIMARY,
    },
    paymentMethodInfo: { flex: 1 },
    paymentMethodHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
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
    disabledText: {
        color: '#999',
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
    paymentRestrictionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        padding: 12,
        backgroundColor: '#fff8e1',
        borderRadius: 8,
    },
    paymentRestrictionText: {
        fontSize: 12,
        color: '#666',
        marginLeft: 8,
        flex: 1,
    },
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

    // Summary styles
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    discountValue: { color: '#00a650' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    totalLabel: { fontSize: 18, fontWeight: 'bold' },
    totalValue: { fontSize: 20, fontWeight: 'bold', color: Colors.PRIMARY },

    tabsRow: { flexDirection: 'row', marginBottom: 12 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
    tabBtnActive: { borderColor: Colors.PRIMARY },
    tabTxt: { color: '#666', fontSize: 14 },
    tabTxtActive: { color: Colors.PRIMARY, fontWeight: '600' },

    checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    checkboxLabel: { marginLeft: 8, fontSize: 14, color: '#333' },

    editBtn: { alignSelf: 'flex-end', marginBottom: 8 },
    editTxt: { color: Colors.PRIMARY, fontWeight: '600' },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 6,
        padding: 10,
        marginBottom: 4,
        fontSize: 14,
    },
    inputError: {
        borderColor: '#ff4444',
        borderWidth: 1.5,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 12,
        marginBottom: 8,
        marginLeft: 4,
    },
    addrLine: { color: '#333', lineHeight: 22 },
    saveBtn: { backgroundColor: Colors.PRIMARY, padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 8 },
    saveTxt: { color: Colors.WHITE, fontWeight: 'bold' },

    // Additional styles from Cart
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
    freeShippingText: {
        fontSize: 12,
        color: '#00a650',
        marginTop: 4,
    },
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
    selectedShippingInfo: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#f0f8ff',
        borderRadius: 8,
        alignItems: 'center',
    },
    selectedShippingText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.PRIMARY,
    },
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
    couponItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    couponIcon: { marginRight: 8 },
    couponCode: { fontSize: 14, fontWeight: '500', flex: 1 },
    couponDiscount: { fontSize: 14, color: '#00a650', fontWeight: 'bold' },
    taxSection: {
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
    noTaxItem: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    noTaxText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    taxItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    taxIcon: { marginRight: 8 },
    taxLabel: { fontSize: 13, color: '#666', flex: 1 },
    taxAmount: { fontSize: 13, fontWeight: '500' },
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

    bottomContainer: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    placeBtn: {
        backgroundColor: Colors.PRIMARY,
        padding: 16,
        alignItems: 'center',
        borderRadius: 8,
    },
    placeTxt: { color: Colors.WHITE, fontSize: 16, fontWeight: 'bold' },

    toast: {
        position: 'absolute',
        left: 20,
        right: 20,
        backgroundColor: '#333',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center'
    },
    toastTxt: { color: '#fff' },
});

