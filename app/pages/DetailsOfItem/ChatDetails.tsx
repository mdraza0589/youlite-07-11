import Colors from '@/utils/Colors';
import React, { useEffect, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Modal,
    Alert,
    RefreshControl,
    FlatList, // <-- Import FlatList
} from 'react-native';
// import { getSession } from '../../lib/services/authService';
import { SafeAreaView } from 'react-native-safe-area-context';
import Loading from '@/app/components/Loading';
import { Ionicons } from '@expo/vector-icons';
// import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view'; // <-- No longer needed
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSession } from '@/lib/services/authService';

interface Message {
    id: string;
    text: string;
    sender: 'customer' | 'admin';
    time: string;
    userName?: string;
    user_id: number;
    created_at: string;
    is_read: boolean;
}

const PC_BASE = 'https://youlitestore.in/wp-json/product-chat/v1';
const PC_FETCH_API = `${PC_BASE}/fetch`;
const PC_SEND_API = `${PC_BASE}/send`;
const PC_DELETE_API = `${PC_BASE}/delete`;
const PC_EDIT_API = `${PC_BASE}/edit`;
const PC_DELETE_CONVO_API = `${PC_BASE}/delete-conversation`;

const ChatDetailScreen = () => {
    const { productId, productName } = useLocalSearchParams<{
        productId: string;
        productName: string;
    }>();

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMsg, setInputMsg] = useState('');
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [userId, setUserId] = useState<number | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [refreshingMessages, setRefreshingMessages] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

    // Edit/Delete modals state
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [longPressedMessage, setLongPressedMessage] = useState<Message | null>(null);

    const flatListRef = useRef<FlatList>(null); // <-- Changed type to FlatList
    const router = useRouter();

    useEffect(() => {
        initUser();
    }, []);

    useEffect(() => {
        if (userId && productId) {
            fetchMessages(parseInt(productId));
        }
    }, [userId, productId]);

    // Auto-refresh messages every 30 seconds
    useEffect(() => {
        if (!productId || !userId) return;

        const interval = setInterval(() => {
            fetchMessages(parseInt(productId));
        }, 30000);

        return () => clearInterval(interval);
    }, [productId, userId]);

    const initUser = async () => {
        const session = await getSession();
        if (session?.user?.id) {
            setUserId(session.user.id);
            setUserName(session.user.name || session.user.first_name || session.user.email);
        }
    };

    const fetchMessages = async (productId: number) => {
        try {
            setLoadingMessages(true);
            const res = await fetch(`${PC_FETCH_API}?product_id=${productId}&customer_id=${userId}`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            const data = await res.json();

            const processedData = data.map((message: any) => ({
                ...message,
                user_id: parseInt(message.user_id, 10),
            }));

            const mapped: Message[] = processedData
                .map((m: any): Message => ({
                    id: m.id.toString(),
                    text: m.message,
                    sender: m.user_id === userId ? 'customer' : 'admin',
                    time: new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    userName: m.user_name,
                    user_id: m.user_id,
                    created_at: m.created_at,
                    is_read: m.is_read === 1 || m.is_read === true,
                }))
                .sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            setMessages(mapped);
            setLastRefreshed(new Date());
            setTimeout(scrollToBottom, 500);
        } catch (e) {
            console.error('Fetch messages error:', e);
            Alert.alert('Error', 'Failed to load messages');
        } finally {
            setLoadingMessages(false);
        }
    };

    const onRefreshMessages = async () => {
        if (!productId || !userId) {
            Alert.alert('Error', 'Cannot refresh messages');
            return;
        }

        setRefreshingMessages(true);
        try {
            await fetchMessages(parseInt(productId));
        } catch (error) {
            console.error('Refresh messages error:', error);
            Alert.alert('Refresh Failed', 'Could not refresh messages');
        } finally {
            setRefreshingMessages(false);
        }
    };

    const sendMessage = async () => {
        if (!productId || !inputMsg.trim() || !userId) return;

        try {
            const body = {
                product_id: parseInt(productId),
                customer_id: userId,
                sender_id: userId,
                message: inputMsg,
            };

            const res = await fetch(PC_SEND_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Send failed: ${res.status} - ${errorText}`);
            }

            const newMessage: Message = {
                id: `temp-${Date.now()}`,
                text: inputMsg,
                sender: 'customer',
                time: timeNow(),
                userName: userName || undefined,
                user_id: userId,
                created_at: new Date().toISOString(),
                is_read: false,
            };

            setMessages((prev) => [...prev, newMessage]);
            setInputMsg('');

            setTimeout(() => {
                if (productId) fetchMessages(parseInt(productId));
            }, 1000);
        } catch (e) {
            console.error('Send message error:', e);
            Alert.alert('Error', 'Failed to send message. Please try again.');
        }
    };

    const deleteMessage = async (messageId: string) => {
        if (!userId) return;

        try {
            const res = await fetch(PC_DELETE_API, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: parseInt(messageId, 10),
                    user_id: userId,
                }),
            });

            if (!res.ok) throw new Error('Failed to delete message');

            const result = await res.json();
            if (result.success) {
                setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
                Alert.alert('Success', 'Message deleted successfully');
            } else {
                throw new Error(result.error || 'Failed to delete message');
            }
        } catch (e) {
            console.error('Delete message error:', e);
            Alert.alert('Error', 'Failed to delete message. You can only delete your own messages.');
        } finally {
            setDeleteModalVisible(false);
            setSelectedMessageId(null);
            setLongPressedMessage(null);
        }
    };

    const editMessage = async () => {
        if (!selectedMessageId || !editText.trim() || !userId) return;

        try {
            const res = await fetch(PC_EDIT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: parseInt(selectedMessageId, 10),
                    user_id: userId,
                    message: editText.trim(),
                }),
            });

            if (!res.ok) throw new Error('Failed to edit message');

            const result = await res.json();
            if (result.success) {
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === selectedMessageId ? { ...msg, text: editText.trim() } : msg
                    )
                );
                Alert.alert('Success', 'Message updated successfully');
            } else {
                throw new Error(result.error || 'Failed to edit message');
            }
        } catch (e) {
            console.error('Edit message error:', e);
            Alert.alert('Error', 'Failed to edit message. You can only edit your own messages.');
        } finally {
            setEditModalVisible(false);
            setSelectedMessageId(null);
            setEditText('');
            setLongPressedMessage(null);
        }
    };

    const deleteConversation = async () => {
        if (!productId || !userId) return;

        Alert.alert(
            'Delete Conversation',
            'Are you sure you want to delete this entire conversation? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const res = await fetch(PC_DELETE_CONVO_API, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    product_id: parseInt(productId),
                                    customer_id: userId,
                                }),
                            });

                            if (!res.ok) throw new Error('Failed to delete conversation');

                            const result = await res.json();
                            if (result.success) {
                                Alert.alert('Success', 'Conversation deleted successfully');
                                router.back();
                            } else {
                                throw new Error(result.error || 'Failed to delete conversation');
                            }
                        } catch (e) {
                            console.error('Delete conversation error:', e);
                            Alert.alert('Error', 'Failed to delete conversation. Please try again.');
                        }
                    },
                },
            ]
        );
    };

    const handleLongPress = (message: Message) => {
        if (message.user_id !== userId) return;

        setLongPressedMessage(message);
        Alert.alert('Message Options', 'What would you like to do?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Edit',
                onPress: () => {
                    setSelectedMessageId(message.id);
                    setEditText(message.text);
                    setEditModalVisible(true);
                },
            },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                    setSelectedMessageId(message.id);
                    setDeleteModalVisible(true);
                },
            },
        ]);
    };

    const timeNow = () => {
        const d = new Date();
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    };

    const scrollToBottom = () => {
        flatListRef.current?.scrollToEnd({ animated: true });
    };

    const formatLastRefreshed = () => {
        if (!lastRefreshed) return '';
        return `Last updated: ${lastRefreshed.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })}`;
    };

    const renderMessage = ({ item }: { item: Message }) => {
        let isCurrentUser = item.user_id === userId;

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onLongPress={() => handleLongPress(item)}
                delayLongPress={500}
            >
                <View style={[styles.msgRow, isCurrentUser ? styles.outgoing : styles.incoming]}>
                    {!isCurrentUser && (
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{item.userName?.charAt(0) || 'A'}</Text>
                        </View>
                    )}
                    <View style={[styles.bubble, isCurrentUser ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
                        {!isCurrentUser && <Text style={styles.userName}>{item.userName || 'Admin'}</Text>}
                        <Text style={[styles.msgText, isCurrentUser && styles.outgoingMsgText]}>{item.text}</Text>
                        <View style={styles.messageFooter}>
                            <Text style={[styles.time, isCurrentUser && styles.outgoingTime]}>{item.time}</Text>
                            {isCurrentUser && (
                                <Text style={styles.readStatus}>{item.is_read ? '✓✓' : '✓'}</Text>
                            )}
                        </View>
                    </View>
                    {isCurrentUser && (
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{userName?.charAt(0) || 'Y'}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle={'dark-content'} backgroundColor={'transparent'} />

            <SafeAreaView style={styles.chatHeader}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtnContainer}>
                    <Ionicons name="arrow-back" size={24} color={Colors.PRIMARY} />
                </TouchableOpacity>
                <View style={styles.chatHeaderCenter}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                        {productName || 'Chat'}
                    </Text>
                    {lastRefreshed && (
                        <Text style={styles.chatSubtitle}>{formatLastRefreshed()}</Text>
                    )}
                </View>
                <TouchableOpacity onPress={deleteConversation} style={styles.deleteBtnContainer}>
                    <Ionicons name="trash-outline" size={22} color="#EF4444" />
                </TouchableOpacity>
            </SafeAreaView>

            {/* This is the main fix. This KeyboardAvoidingView now wraps
              both the content (list, loading, empty) AND the input bar.
            */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            // You may need to add/tweak a keyboardVerticalOffset if the header
            // is unusually tall, but start without one.
            // Example: keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {loadingMessages ? (
                    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                        <Loading />
                        <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '600', color: Colors.SECONDARY }}>
                            Loading your Chats
                        </Text>
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="chatbubble-ellipses-outline" size={64} color="#CCC" />
                        <Text style={styles.emptyStateText}>No messages yet</Text>
                        <Text style={styles.emptyStateSubText}>Start a conversation about this product</Text>
                        <TouchableOpacity style={styles.refreshButton} onPress={onRefreshMessages}>
                            <Ionicons name="refresh" size={20} color={Colors.PRIMARY} />
                            <Text style={styles.refreshButtonText}>Refresh</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList // <-- Changed to regular FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messagesContainer}
                        onContentSizeChange={scrollToBottom} // These are fine
                        onLayout={scrollToBottom} // These are fine
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshingMessages}
                                onRefresh={onRefreshMessages}
                                colors={[Colors.PRIMARY]}
                                tintColor={Colors.PRIMARY}
                                title="Refreshing messages..."
                                titleColor={Colors.PRIMARY}
                            />
                        }
                        showsVerticalScrollIndicator={false}
                        // Removed extraHeight and enableOnAndroid (from KeyboardAwareFlatList)
                        keyboardShouldPersistTaps="handled" // This is fine on FlatList
                    />
                )}

                {/* This is the input bar, now INSIDE the KAV and as a regular View */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Type your message..."
                        placeholderTextColor="#999"
                        value={inputMsg}
                        onChangeText={setInputMsg}
                        multiline
                        maxLength={500}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, !inputMsg.trim() && styles.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!inputMsg.trim()}
                    >
                        <Ionicons name="send" size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Edit Message Modal */}
            <Modal
                visible={editModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Edit Message</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Edit your message..."
                            value={editText}
                            onChangeText={setEditText}
                            multiline
                            maxLength={500}
                            autoFocus
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => {
                                    setEditModalVisible(false);
                                    setEditText('');
                                    setSelectedMessageId(null);
                                }}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.saveButton]}
                                onPress={editMessage}
                                disabled={!editText.trim()}
                            >
                                <Text style={styles.saveButtonText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Message Modal */}
            <Modal
                visible={deleteModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setDeleteModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Delete Message</Text>
                        <Text style={styles.modalText}>
                            Are you sure you want to delete this message? This action cannot be undone.
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => {
                                    setDeleteModalVisible(false);
                                    setSelectedMessageId(null);
                                }}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.deleteButton]}
                                onPress={() => selectedMessageId && deleteMessage(selectedMessageId)}
                            >
                                <Text style={styles.deleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// ... Your styles remain exactly the same ...
// (I've included them for completeness)
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f6f7fb' },
    chatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderColor: '#eee',
    },
    backBtnContainer: {
        padding: 4,
    },
    chatHeaderCenter: {
        flex: 1,
        marginHorizontal: 12,
        alignItems: 'center',
    },
    deleteBtnContainer: {
        padding: 4,
    },
    chatTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
    chatSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    readStatus: {
        fontSize: 12,
        color: '#4ADE80',
        marginLeft: 4,
    },
    msgRow: { marginVertical: 6, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12 },
    incoming: { justifyContent: 'flex-start' },
    outgoing: { justifyContent: 'flex-end' },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    avatarText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    bubble: { maxWidth: '70%', padding: 12, borderRadius: 20, marginHorizontal: 4 },
    bubbleIncoming: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
    bubbleOutgoing: { backgroundColor: Colors.PRIMARY },
    userName: { fontWeight: '600', marginBottom: 4, color: '#555', fontSize: 12 },
    msgText: { fontSize: 15, color: '#000', lineHeight: 20 },
    outgoingMsgText: { color: '#fff' },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    time: { fontSize: 11, color: '#666' },
    outgoingTime: { color: 'rgba(255,255,255,0.8)' },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        alignItems: 'flex-end',
        borderTopWidth: 1,
        borderColor: '#eee',
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 25,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        maxHeight: 100,
        backgroundColor: '#f9f9f9',
    },
    sendBtn: {
        marginLeft: 8,
        backgroundColor: Colors.PRIMARY,
        borderRadius: 25,
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendBtnDisabled: { backgroundColor: '#ccc' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyStateText: { fontSize: 18, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 16 },
    emptyStateSubText: { fontSize: 14, color: '#999', textAlign: 'center' },
    messagesContainer: { paddingVertical: 12 },
    refreshButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.PRIMARY,
        marginTop: 16,
    },
    refreshButtonText: {
        color: Colors.PRIMARY,
        fontWeight: '600',
        marginLeft: 6,
    },

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 16,
    },
    modalText: {
        fontSize: 15,
        color: '#6B7280',
        marginBottom: 20,
        lineHeight: 22,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        minHeight: 100,
        maxHeight: 150,
        textAlignVertical: 'top',
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        minWidth: 80,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#F3F4F6',
    },
    cancelButtonText: {
        color: '#374151',
        fontWeight: '600',
        fontSize: 15,
    },
    saveButton: {
        backgroundColor: '#10B981',
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    deleteButton: {
        backgroundColor: '#EF4444',
    },
    deleteButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
});

export default ChatDetailScreen;

