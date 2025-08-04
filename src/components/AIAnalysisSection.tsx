import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, SavedAnalysis, Tag, User } from '../types';
import { useAIAnalysis, AnalysisResult } from '../hooks/useAIAnalysis';
import { useUserSettings } from '../hooks/useUserSettings';
import { PlanService } from '../services/planService';
import { UpgradeModal } from './UpgradeModal';

interface AIAnalysisSectionProps {
  user: User | null;
  tag: Tag;
  tagLinks: Link[];
}

export const AIAnalysisSection: React.FC<AIAnalysisSectionProps> = ({ user, tag, tagLinks }) => {
  const { 
    loadingSuggestions, 
    aiSuggestions, 
    aiAnalyzing, 
    analysisHistory, 
    handleGenerateSuggestions, 
    executeAIAnalysis, 
    selectLinksForSuggestedAnalysis,
  } = useAIAnalysis(user, tag, tagLinks);

  const { settings, updateSetting } = useUserSettings(user?.uid || null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const planInfo = PlanService.getDebugInfo(user);
  const canUseAI = PlanService.canUseAI(user);

  const handleSuggestedAnalysis = useCallback(async (suggestedTheme: string) => {
    const execution = () => {
      const suggestion = { title: suggestedTheme, keywords: [], description: '' };
      const selectedLinks = selectLinksForSuggestedAnalysis(tagLinks, suggestion);
      executeAIAnalysis(selectedLinks, suggestedTheme);
    };

    if (settings.hideAIAnalysisAlert) {
      execution();
    } else {
      Alert.alert(
        'Start AI Analysis?',
        `Analyze links related to "${suggestedTheme}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: "Don't ask again", onPress: () => {
            updateSetting('hideAIAnalysisAlert', true);
            execution();
          }},
          { text: 'Start', onPress: execution },
        ]
      );
    }
  }, [tagLinks, executeAIAnalysis, selectLinksForSuggestedAnalysis, settings.hideAIAnalysisAlert, updateSetting]);

  const renderMarkdownContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, index) => <Text key={index} style={styles.analysisText}>{line}</Text>);
  };

  const handleAnalysisLinkPress = useCallback(async (url: string) => {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Cannot open this URL.');
    }
  }, []);

  const renderAnalysisResult = (analysis: AnalysisResult) => {
    return (
      <View style={styles.analysisItem}>
        {renderMarkdownContent(analysis.result)}
      </View>
    )
  }

  const renderContent = () => {
    if (loadingSuggestions || aiAnalyzing) {
      return <ActivityIndicator color="#8A2BE2" />;
    }

    if (analysisHistory.length > 0) {
        return analysisHistory.map(renderAnalysisResult);
    }

    if (aiSuggestions.length > 0) {
      return (
        <View style={styles.themesContainer}>
          {aiSuggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.themeItem}
              onPress={() => handleSuggestedAnalysis(suggestion.title)}
            >
              <Text style={styles.themeTitle}>{suggestion.title}</Text>
              <Text style={styles.themeDescription}>{suggestion.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (!canUseAI) {
        return (
            <TouchableOpacity style={styles.upgradePromptButton} onPress={() => setShowUpgradeModal(true)}>
                <Feather name="trending-up" size={16} color="#FFF" />
                <Text style={styles.upgradePromptButtonText}>Increase Limit</Text>
            </TouchableOpacity>
        );
    }

    return (
      <TouchableOpacity
        style={[styles.generateButton, tagLinks.length === 0 && styles.generateButtonDisabled]}
        onPress={handleGenerateSuggestions}
        disabled={tagLinks.length === 0}
      >
        <Feather name="zap" size={16} color="#8A2BE2" />
        <Text style={styles.generateButtonText}>Generate Analysis Themes</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.aiAnalysisSection}>
        <View style={styles.aiSectionHeader}>
            <Text style={styles.aiSectionTitle}>AI Insights</Text>
            <View style={styles.usageBadge}>
                <Text style={styles.usageBadgeText}>{planInfo.displayName}</Text>
            </View>
        </View>
        {renderContent()}
        <UpgradeModal visible={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
    aiAnalysisSection: {
        padding: 15,
        backgroundColor: '#1C1C1E',
        borderRadius: 10,
        marginVertical: 10,
      },
      aiSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      },
      aiSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
      },
      usageBadge: {
        backgroundColor: '#3A3A3C',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 15,
      },
      usageBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '500',
      },
    generateButton: {
        backgroundColor: '#3A3A3C',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    generateButtonText: {
        color: '#8A2BE2',
        marginLeft: 10,
        fontWeight: 'bold',
    },
    generateButtonDisabled: {
        opacity: 0.5,
    },
    upgradePromptButton: {
        backgroundColor: '#8A2BE2',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    upgradePromptButtonText: {
        color: '#FFF',
        marginLeft: 10,
        fontWeight: 'bold',
    },
    themesContainer: {
        marginTop: 10,
    },
    themeItem: {
        backgroundColor: '#2C2C2E',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    themeTitle: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    themeDescription: {
        color: '#AEAEB2',
        marginTop: 5,
    },
    analysisItem: {
        backgroundColor: '#2C2C2E',
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    analysisText: {
        color: '#FFF',
    }
});
