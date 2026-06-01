import { useCallback } from 'react';
import type { DetectedUnit, Point } from '@/types/project';

interface CorrectionLoggerOptions {
    projectId: string;
    fileId: string;
    inputFileType: 'dwg' | 'dxf' | 'pdf';
    moodId?: string;
    operatorEmail?: string;
}

/**
 * Hook to log corrections made by operators in PlanCanvas.
 * Every edit is persisted to Supabase as structured training data for V2.
 */
export function useCorrectionLogger(options: CorrectionLoggerOptions) {
    // Helper: Calculate area from polygon points (shoelace formula)
    const calculateAreaFromPolygon = useCallback((polygon: Point[]): number => {
        if (polygon.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            area += polygon[i].x * polygon[j].y;
            area -= polygon[j].x * polygon[i].y;
        }
        return Math.abs(area / 2);
    }, []);

    // Log polygon edits (vertex dragging, etc.)
    const logPolygonEdit = useCallback(
        async (
            unit: DetectedUnit,
            originalPolygon: Point[],
            correctedPolygon: Point[],
            operatorNotes?: string,
            correctionConfidence: number = 0.95
        ): Promise<boolean> => {
            if (!options.projectId || !options.fileId) {
                console.warn('[useCorrectionLogger] Missing projectId or fileId');
                return false;
            }

            try {
                const response = await fetch('/api/corrections/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: options.projectId,
                        fileId: options.fileId,
                        correctionType: 'polygon_edit',
                        unitId: unit.id,
                        beforeState: {
                            polygon: originalPolygon,
                            classification: unit.classification,
                            area: calculateAreaFromPolygon(originalPolygon),
                            aiConfidence: unit.confidence,
                            aiSource: 'gpt4_vision', // Vision model: gpt-5 (OpenAI)
                        },
                        afterState: {
                            polygon: correctedPolygon,
                            classification: unit.classification,
                            area: calculateAreaFromPolygon(correctedPolygon),
                        },
                        operatorNotes:
                            operatorNotes ||
                            `Operator manually edited polygon vertices for ${unit.label}`,
                        operatorConfidence: 0.95, // Operator edits are always high confidence
                        correctionConfidence,
                        moodId: options.moodId,
                        inputFileType: options.inputFileType,
                        operatorEmail: options.operatorEmail || 'anonymous',
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('[useCorrectionLogger] Error logging polygon edit:', error);
                    return false;
                }

                const result = await response.json();
                console.log(
                    '[useCorrectionLogger] Polygon edit logged:',
                    result.correctionId
                );
                return true;
            } catch (err) {
                console.error('[useCorrectionLogger] Network error:', err);
                return false;
            }
        },
        [options, calculateAreaFromPolygon]
    );

    // Log classification changes (type corrections)
    const logClassificationChange = useCallback(
        async (
            unit: DetectedUnit,
            originalClassification: string,
            newClassification: string,
            operatorNotes?: string,
            correctionConfidence: number = 0.95
        ): Promise<boolean> => {
            if (!options.projectId || !options.fileId) {
                console.warn('[useCorrectionLogger] Missing projectId or fileId');
                return false;
            }

            try {
                const payload = {
                    projectId: options.projectId,
                    fileId: options.fileId,
                    correctionType: 'unit_classification',
                    unitId: unit?.id || null,
                    beforeState: {
                        classification: originalClassification,
                        aiConfidence: unit.confidence,
                        aiSource: 'gpt4_vision',
                    },
                    afterState: {
                        classification: newClassification,
                    },
                    operatorNotes:
                        operatorNotes ||
                        `Classification changed from ${originalClassification} to ${newClassification}`,
                    operatorConfidence: 0.95,
                    correctionConfidence,
                    moodId: options.moodId,
                    inputFileType: options.inputFileType,
                    operatorEmail: options.operatorEmail || 'anonymous',
                };

                const response = await fetch('/api/corrections/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('[useCorrectionLogger] Error logging classification:', error);
                    return false;
                }

                const result = await response.json();
                console.log(
                    '[useCorrectionLogger] Classification change logged:',
                    result.correctionId
                );
                return true;
            } catch (err) {
                console.error('[useCorrectionLogger] Network error:', err);
                return false;
            }
        },
        [options]
    );

    // Log furniture placement corrections
    const logFurniturePlacement = useCallback(
        async (
            unitId: string,
            furnitureId: string,
            position: { x: number; y: number },
            operatorNotes?: string,
            correctionConfidence: number = 0.9
        ): Promise<boolean> => {
            if (!options.projectId || !options.fileId) {
                console.warn('[useCorrectionLogger] Missing projectId or fileId');
                return false;
            }

            try {
                const response = await fetch('/api/corrections/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: options.projectId,
                        fileId: options.fileId,
                        correctionType: 'furniture_placement',
                        unitId,
                        beforeState: {},
                        afterState: {
                            furnitureId,
                            position,
                        },
                        operatorNotes:
                            operatorNotes ||
                            `Furniture placement: ${furnitureId} at (${position.x}, ${position.y})`,
                        operatorConfidence: 0.95,
                        correctionConfidence,
                        moodId: options.moodId,
                        inputFileType: options.inputFileType,
                        operatorEmail: options.operatorEmail || 'anonymous',
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('[useCorrectionLogger] Error logging furniture:', error);
                    return false;
                }

                const result = await response.json();
                console.log(
                    '[useCorrectionLogger] Furniture placement logged:',
                    result.correctionId
                );
                return true;
            } catch (err) {
                console.error('[useCorrectionLogger] Network error:', err);
                return false;
            }
        },
        [options]
    );

    return {
        logPolygonEdit,
        logClassificationChange,
        logFurniturePlacement,
    };
}
