// services/orderService.ts
import axios from "axios";
import {
  addOrder,
  createRazorOrder,
  deleteOrder,
  getOrderDetail,
  getOrders,
  updateOrder,
} from "../../lib/api/orderApi";

import { WooCommerce } from "@/lib/api/woocommerce";
import { API_CONSUMER_KEY, API_CONSUMER_SECRET } from "@/utils/apiUtils/constants";
import { getToken } from "./authService";


const buildAuthHeaders = async () => {
  const tokenObj = await getToken();
  const token = tokenObj?.token ?? null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};


export const loadOrders = async (params?: { user?: number; per_page?: number }) => {
  try {
    const response = await getOrders(params);
    return response.data;
  } catch (error) {
    console.error("Error fetching orders:", error);
    throw error;
  }
};

export const loadOrderDetail = async (id: number | string) => {
  try {
    const response = await getOrderDetail(id);
    return response.data;
  } catch (error) {
    console.error(`Error fetching order ${id}:`, error);
    throw error;
  }
};

export const createOrder = async (data: any) => {
  try {
    const response = await addOrder(data);
    return response.data;
  } catch (error) {
    console.error("Error creating order:", error);
    throw error;
  }
};

export const editOrder = async (id: number | string, data: any) => {
  try {
    const response = await updateOrder(id, data);
    return response.data;
  } catch (error) {
    console.error(`Error updating order ${id}:`, error);
    throw error;
  }
};

export const removeOrder = async (id: number | string) => {
  try {
    const response = await deleteOrder(id);
    return response.data;
  } catch (error) {
    console.error(`Error deleting order ${id}:`, error);
    throw error;
  }
};

export type CreateRazorpayOrderPayload = {
  amount: number;
  currency?: string;
  receipt?: string;
};

export type CreateRazorpayOrderResult = {
  success: boolean;
  razorpay_order_id?: string;
  key_id?: string;
  raw?: any;
  error?: string;
};

export const createRazorpayOrder = async (payload: CreateRazorpayOrderPayload): Promise<CreateRazorpayOrderResult> => {
  const API_URL = "https://youlitestore.in/wp-json/my-app/v1/create-razorpay-order";
  try {
    const headers = await buildAuthHeaders();

    if (!payload || typeof payload.amount !== "number" || payload.amount <= 0) {
      return { success: false, error: "Invalid amount" };
    }

    const body = {
      amount: payload.amount, // rupees
      currency: payload.currency ?? "INR",
      receipt: payload.receipt ?? `rcpt_app_${Date.now()}`,
    };

    const response = await axios.post(API_URL, body, { headers });

    const data = response.data;
    if (!data || !data.razorpay_order_id || !data.key_id) {
      return { success: false, error: "Invalid response from create-razorpay-order", raw: data };
    }

    return {
      success: true,
      razorpay_order_id: data.razorpay_order_id,
      key_id: data.key_id,
      raw: data,
    };
  } catch (err: any) {
    console.error("createRazorpayOrder error:", err?.response?.data ?? err.message ?? err);
    return { success: false, error: err?.response?.data ?? err?.message ?? String(err) };
  }
};

export type ProcessRazorpayPaymentPayload = {
  order_id?: number;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type ProcessRazorpayPaymentResult = {
  success: boolean;
  message?: string;
  verifyResponse?: any;
  updateResponse?: any;
  error?: string;
};

export const processRazorpayPayment = async (
  paymentData: ProcessRazorpayPaymentPayload
): Promise<ProcessRazorpayPaymentResult> => {
  try {
    // Validate required fields
    if (!paymentData.razorpay_payment_id || !paymentData.razorpay_order_id || !paymentData.razorpay_signature) {
      return { success: false, error: "Missing Razorpay payment fields." };
    }

    const VERIFY_API_URL = "https://youlitestore.in/wp-json/my-app/v1/verify-payment";
    const headers = await buildAuthHeaders();

    const verifyResp = await axios.post(
      VERIFY_API_URL,
      {
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_signature: paymentData.razorpay_signature,
      },
      { headers }
    );

    const verifyData = verifyResp.data;
    if (!verifyData || verifyData.status !== "success") {
      return { success: false, error: verifyData?.message ?? "Verification failed", verifyResponse: verifyData };
    }

    const result: ProcessRazorpayPaymentResult = {
      success: true,
      message: verifyData.message ?? "Payment verified successfully.",
      verifyResponse: verifyData,
    };

    if (paymentData.order_id) {
      try {
        const updateResp = await updateOrderStatus(paymentData.order_id, "processing");
        result.updateResponse = updateResp;
      } catch (updateErr: any) {
        console.warn("Failed to update WooCommerce order status:", updateErr?.response?.data ?? updateErr);
        result.updateResponse = { error: updateErr?.response?.data ?? updateErr?.message ?? String(updateErr) };
      }
    }

    return result;
  } catch (error: any) {
    console.error("processRazorpayPayment error:", error?.response?.data ?? error?.message ?? error);
    const msg = error?.response?.data ?? error?.message ?? String(error);
    return { success: false, error: msg };
  }
};

export const updateOrderStatus = async (orderId: number, status: string) => {
  const BASE_URL = `https://youlitestore.in/wp-json/wc/v3/orders/${orderId}?consumer_key=${API_CONSUMER_KEY}&consumer_secret=${API_CONSUMER_SECRET}`;
  const payload = { status };
  try {
    const response = await axios.put(BASE_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Order updated successfully:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("❌ Failed to update order:", error.response?.data || error);
    throw error;
  }
};

