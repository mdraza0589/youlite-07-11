import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type HelpTopic = {
    id: number;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    path: string;
};

type ExpandedSections = {
    [key: number]: boolean;
};

const Help = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState<ExpandedSections>({});

    const toggleFAQ = (faqId: number) => {
        setExpandedSections(prev => ({
            ...prev,
            [faqId]: !prev[faqId]
        }));
    };

    const popularTopics: HelpTopic[] = [
        { id: 1, title: 'Terms and Conditions', icon: 'card', path: '/termsAllPages/termsAndCondition' },
        { id: 2, title: 'Privacy and Policy', icon: 'refresh-circle', path: '/termsAllPages/Pivacy' },
        { id: 3, title: 'Return and Replacement', icon: 'lock-closed', path: '/termsAllPages/Return' },
        { id: 4, title: 'Shipping & Delivery', icon: 'boat', path: '/termsAllPages/Shipping' },
    ];

    const faqs = [
        { id: 1, question: 'How long do solar lights last?', answer: 'Most solar lights last between 3 to 5 years, depending on the quality of the battery and exposure to sunlight.' },
        { id: 2, question: 'Do solar lights work on cloudy or rainy days?', answer: 'Yes, solar lights can still work on cloudy days, but the performance may be reduced since less sunlight is available for charging.' },
        { id: 3, question: 'How many hours do solar lights stay on at night?', answer: 'Fully charged solar lights usually run for 8-12 hours at night, depending on the battery capacity and brightness settings.' },
        { id: 4, question: 'Do solar products need a lot of maintenance?', answer: 'Solar lights require very little maintenance. Cleaning the solar panel occasionally and replacing the battery every few years keeps them working efficiently.' },
    ];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Help Center</Text>
                <View />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Search */}
                {/* <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search for help..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View> */}

                {/* Popular Topics (styled like old FAQ items) */}
                <Text style={styles.sectionTitle}>Popular Topics</Text>
                {popularTopics.map(topic => (
                    <TouchableOpacity
                        key={topic.id}
                        style={styles.faqItem}
                        onPress={() => router.push(topic.path)}
                    >
                        <View style={styles.faqHeader}>
                            <Text style={styles.faqQuestion}>{topic.title}</Text>
                            <Ionicons name="chevron-forward" size={20} color="#4a6da7" />
                        </View>
                    </TouchableOpacity>
                ))}

                {/* FAQ Section (styled like old Popular Topics cards) */}
                <View style={styles.faqSection}>
                    <Text style={styles.sectionTitle}>FAQ</Text>
                    {faqs.map(faq => (
                        <View key={faq.id} style={styles.topicCard}>
                            <TouchableOpacity
                                style={styles.topicHeader}
                                onPress={() => toggleFAQ(faq.id)}
                            >
                                <Text style={styles.topicTitle}>{faq.question}</Text>
                                <Ionicons
                                    name={expandedSections[faq.id] ? 'chevron-up' : 'chevron-down'}
                                    size={22}
                                    color="#4a6da7"
                                />
                            </TouchableOpacity>
                            {expandedSections[faq.id] && (
                                <Text style={styles.faqAnswer}>{faq.answer}</Text>
                            )}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    header: {
        marginBottom: 6,
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
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.WHITE,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginVertical: 20,
        borderRadius: 10,
        paddingHorizontal: 15,
        height: 50,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#333',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#1a1a1a',
        marginTop:10
    },
    // Popular Topics styled like old FAQ items
    faqItem: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
    },
    faqHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    faqQuestion: {
        fontSize: 16,
        color: '#333',
        paddingRight: 10,
    },
    // FAQ section styled like old Popular Topics cards
    topicCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    topicHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    topicTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1a1a1a',
        flex: 1,
        paddingRight: 10,
    },
    faqAnswer: {
        fontSize: 14,
        color: '#555',
        marginTop: 10,
        lineHeight: 20,
    },
    // Add this:
    faqSection: {
        marginBottom: 30,
    },
});


export default Help;
