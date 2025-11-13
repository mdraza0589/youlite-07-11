import imagePath from "@/constant/imagePath";
import {
  API_CONSUMER_KEY,
  API_CONSUMER_SECRET,
} from "@/utils/apiUtils/constants";
import Colors from "@/utils/Colors";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ShipmentTracking {
  shipping_provider: string;
  order_id: string;
  awb: string;
  current_status: string;
  current_address: string | null;
  current_country: string | null;
  current_pincode: string | null;
  courier_name: string;
  etd: string;
  scans: any[];
  tracking_url: string | null;
  delivery_date: string | null;
}

const OrderDetails = () => {
  const { id } = useLocalSearchParams();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [shipmentTracking, setShipmentTracking] = useState<ShipmentTracking | null>(null);
  const [pressedItem, setPressedItem] = useState<string | null>(null);

  // --- Fetch Order Details ---
  const fetchOrderDetails = async () => {
    try {
      const res = await fetch(
        `https://youlitestore.in/wp-json/wc/v3/orders/${id}?consumer_key=${API_CONSUMER_KEY}&consumer_secret=${API_CONSUMER_SECRET}`
      );
      const data = await res.json();
      setOrder(data);

      // Extract Shiprocket tracking info from meta_data
      const trackingMeta = data.meta_data?.find(
        (meta: any) => meta.key === "_bt_shipment_tracking"
      );
      if (trackingMeta?.value) {
        setShipmentTracking(trackingMeta.value);
      }
    } catch (err) {
      console.error("Error fetching order:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [id]);

  // --- Cancel Order API ---
  const cancelOrder = async () => {
    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          onPress: async () => {
            try {
              setIsCancelling(true);
              const res = await fetch(
                `https://youlitestore.in/wp-json/wc/v3/orders/${id}?consumer_key=${API_CONSUMER_KEY}&consumer_secret=${API_CONSUMER_SECRET}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ status: "cancelled" }),
                }
              );

              if (!res.ok) throw new Error("Failed to cancel order");

              const updated = await res.json();
              setOrder(updated);

              Alert.alert("Success", "Your order has been cancelled.");
            } catch (err) {
              console.error("Error cancelling order:", err);
              Alert.alert("Error", "Failed to cancel the order. Please try again.");
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  // --- Open Tracking URL ---
  const openTrackingUrl = async () => {
    if (shipmentTracking?.awb) {
      const trackingUrl = `https://shiprocket.co/tracking/${shipmentTracking.awb}`;
      try {
        const supported = await Linking.canOpenURL(trackingUrl);
        if (supported) {
          await Linking.openURL(trackingUrl);
        } else {
          Alert.alert("Error", "Unable to open tracking URL");
        }
      } catch (err) {
        console.error("Error opening URL:", err);
        Alert.alert("Error", "Failed to open tracking link");
      }
    } else {
      Alert.alert("Info", "Tracking information not available yet");
    }
  };

  // --- Get Status Color ---
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "#10B981";
      case "delivered":
        return "#10B981";
      case "cancelled":
      case "canceled":
        return "#EF4444";
      case "processing":
      case "pickup-booked":
      case "in-transit":
        return "#F59E0B";
      case "pending":
        return "#6B7280";
      default:
        return "#3B82F6";
    }
  };

  // --- Format Status Text ---
  const formatStatus = (status: string) => {
    return status
      ?.split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // --- Loading State ---
  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={Colors.PRIMARY} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerBox}>
        <Text style={{ color: "#333", fontSize: 16 }}>Order not found.</Text>
      </View>
    );
  }

  const {
    id: orderId,
    date_created,
    total,
    line_items,
    billing,
    shipping,
    payment_method_title,
    status,
    shipping_total,
    total_tax,
  } = order;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.PRIMARY} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{orderId}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order Date:</Text>
            <Text style={styles.summaryValue}>
              {new Date(date_created).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order Status:</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(status) + "20" },
              ]}
            >
              <Text
                style={[styles.statusText, { color: getStatusColor(status) }]}
              >
                {formatStatus(status)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order Total:</Text>
            <Text style={styles.totalAmount}>₹{total}</Text>
          </View>
        </View>

        {/* Shiprocket Tracking Info */}
        {shipmentTracking && (
          <View style={styles.section}>
            <View style={styles.trackingHeader}>
              <Ionicons name="cube-outline" size={24} color={Colors.PRIMARY} />
              <Text style={styles.sectionTitle}>Shipment Tracking</Text>
            </View>

            <View style={styles.trackingCard}>
              <View style={styles.trackingRow}>
                <Text style={styles.trackingLabel}>Courier:</Text>
                <Text style={styles.trackingValue}>
                  {shipmentTracking.courier_name}
                </Text>
              </View>

              <View style={styles.trackingRow}>
                <Text style={styles.trackingLabel}>AWB Number:</Text>
                <Text style={[styles.trackingValue, styles.awbText]}>
                  {shipmentTracking.awb}
                </Text>
              </View>

              <View style={styles.trackingRow}>
                <Text style={styles.trackingLabel}>Status:</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        getStatusColor(shipmentTracking.current_status) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(shipmentTracking.current_status) },
                    ]}
                  >
                    {formatStatus(shipmentTracking.current_status)}
                  </Text>
                </View>
              </View>

              {shipmentTracking.etd && (
                <View style={styles.trackingRow}>
                  <Text style={styles.trackingLabel}>Expected Delivery:</Text>
                  <Text style={styles.trackingValue}>
                    {new Date(shipmentTracking.etd).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              )}

              {shipmentTracking.delivery_date && (
                <View style={styles.trackingRow}>
                  <Text style={styles.trackingLabel}>Delivered On:</Text>
                  <Text style={[styles.trackingValue, { color: "#10B981" }]}>
                    {new Date(shipmentTracking.delivery_date).toLocaleDateString(
                      "en-IN",
                      {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </Text>
                </View>
              )}
            </View>

            {/* Track Shipment Button */}
            <TouchableOpacity
              style={styles.trackButton}
              onPress={openTrackingUrl}
            >
              <Ionicons name="navigate-outline" size={20} color="#fff" />
              <Text style={styles.trackButtonText}>Track Shipment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Products */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {line_items?.map((item: any, index: number) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.productContainer,
                index > 0 && {
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#E5E7EB"
                },
                pressedItem === item.id.toString() && styles.pressedItem,
              ]}
              onPressIn={() => setPressedItem(item.id.toString())}
              onPressOut={() => setPressedItem(null)}
              onPress={() => {
                if (item.product_id) {
                  router.push({
                    pathname: '/pages/DetailsOfItem/ItemDetails',
                    params: {
                      id: item.product_id.toString(),
                      title: item.name
                    }
                  });
                } else {
                  Alert.alert('Info', 'Product details not available');
                }
              }}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: item.image?.src || imagePath.image1 }}
                style={styles.productImage}
              />
              <View style={styles.productDetails}>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.productMeta}>
                  <Text style={styles.productPrice}>₹{item.price}</Text>
                  <Text style={styles.quantity}>× {item.quantity}</Text>
                </View>
                <Text style={styles.productTotal}>
                  Subtotal: ₹{item.total}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color="#9CA3AF"
                style={styles.chevronIcon}
              />
            </TouchableOpacity>
          ))}

          {/* Price Breakdown */}
          <View style={styles.priceBreakdown}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceValue}>
                ₹{(parseFloat(total) - parseFloat(shipping_total) - parseFloat(total_tax)).toFixed(2)}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Shipping</Text>
              <Text style={styles.priceValue}>₹{shipping_total}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Tax</Text>
              <Text style={styles.priceValue}>₹{total_tax}</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total}</Text>
            </View>
          </View>
        </View>

        {/* Payment Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Information</Text>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="card-outline" size={20} color={Colors.PRIMARY} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Payment Method</Text>
                <Text style={styles.infoText}>{payment_method_title}</Text>
              </View>
            </View>
          </View>

          {/* Cancel Order */}
          {(status === "pending" || status === "processing") && !shipmentTracking && (
            <TouchableOpacity
              style={[
                styles.cancelButton,
                isCancelling && { backgroundColor: "#ccc" },
              ]}
              onPress={cancelOrder}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={20} color="#fff" />
                  <Text style={styles.cancelButtonText}>Cancel Order</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Shipping Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping Address</Text>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={Colors.PRIMARY} />
              <View style={styles.infoContent}>
                <Text style={styles.addressName}>
                  {shipping?.first_name} {shipping?.last_name}
                </Text>
                <Text style={styles.addressText}>{shipping?.address_1}</Text>
                {shipping?.address_2 && (
                  <Text style={styles.addressText}>{shipping?.address_2}</Text>
                )}
                <Text style={styles.addressText}>
                  {shipping?.city}, {shipping?.state} - {shipping?.postcode}
                </Text>
                <Text style={styles.addressText}>{shipping?.country}</Text>
                {shipping?.phone && (
                  <Text style={styles.addressPhone}>📞 {shipping?.phone}</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Billing Info */}
        <View style={[styles.section, { marginBottom: 24 }]}>
          <Text style={styles.sectionTitle}>Billing Information</Text>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={20} color={Colors.PRIMARY} />
              <View style={styles.infoContent}>
                <Text style={styles.addressName}>
                  {billing?.first_name} {billing?.last_name}
                </Text>
                <Text style={styles.addressText}>📧 {billing?.email}</Text>
                <Text style={styles.addressText}>📞 {billing?.phone}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrderDetails;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: Colors.WHITE },
  scrollView: { flex: 1, paddingHorizontal: 16 },
  section: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  summaryLabel: { fontSize: 14, color: "#6B7280" },
  summaryValue: { fontSize: 14, fontWeight: "600", color: "#111827" },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 13, fontWeight: "600" },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.PRIMARY,
  },
  trackingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  trackingCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  trackingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  trackingLabel: { fontSize: 14, color: "#6B7280", flex: 1 },
  trackingValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  awbText: {
    fontFamily: "monospace",
    letterSpacing: 0.5,
  },
  trackButton: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  trackButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  productContainer: {
    flexDirection: "row",
    marginTop: 12,
    alignItems: "center",
  },
  pressedItem: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 8,
    margin: -8,
  },
  productImage: {
    width: 90,
    height: 90,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  productDetails: {
    marginLeft: 12,
    justifyContent: "space-between",
    flex: 1,
    paddingRight: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  productMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.PRIMARY,
  },
  quantity: {
    fontSize: 14,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productTotal: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
    marginTop: 4,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  priceBreakdown: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  priceLabel: { fontSize: 14, color: "#6B7280" },
  priceValue: { fontSize: 14, color: "#374151", fontWeight: "500" },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: "#111827" },
  totalValue: { fontSize: 18, fontWeight: "bold", color: Colors.PRIMARY },
  infoBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  infoText: { fontSize: 15, color: "#111827", fontWeight: "500" },
  addressName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  addressText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  addressPhone: {
    fontSize: 14,
    color: Colors.PRIMARY,
    marginTop: 4,
    fontWeight: "500",
  },
  cancelButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});