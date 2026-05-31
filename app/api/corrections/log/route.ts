import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Point } from '@/types/project';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CorrectionLogRequest {
    projectId: string;
    fileId: string;
    correctionType: 'polygon_edit' | 'unit_classification' | 'furniture_placement';
    unitId: string;
    beforeState: {
        polygon?: Point[];
        classification?: string;
        area?: number;
        aiConfidence?: number;
        aiSource?: string;
    };
    afterState: {
        polygon?: Point[];
        classification?: string;
        area?: number;
    };
    operatorNotes?: string;
    operatorConfidence: number; // 0.0 to 1.0
    correctionConfidence: number; // 0.0 to 1.0
    moodId?: string;
    inputFileType: 'dwg' | 'dxf' | 'pdf';
    operatorEmail?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: CorrectionLogRequest = await request.json();

        // Validate required fields
        if (
            !body.projectId ||
            !body.fileId ||
            !body.unitId ||
            !body.correctionType
        ) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, fileId, unitId, correctionType' },
                { status: 400 }
            );
        }

        // Ensure confidence scores are valid
        if (
            body.operatorConfidence < 0 ||
            body.operatorConfidence > 1 ||
            body.correctionConfidence < 0 ||
            body.correctionConfidence > 1
        ) {
            return NextResponse.json(
                { error: 'Confidence scores must be between 0 and 1' },
                { status: 400 }
            );
        }

        // Calculate area from polygon if not provided
        const calculateAreaFromPolygon = (polygon: Point[] | undefined): number => {
            if (!polygon || polygon.length < 3) return 0;
            let area = 0;
            for (let i = 0; i < polygon.length; i++) {
                const j = (i + 1) % polygon.length;
                area += polygon[i].x * polygon[j].y;
                area -= polygon[j].x * polygon[i].y;
            }
            return Math.abs(area / 2);
        };

        const beforeArea =
            body.beforeState.area ||
            calculateAreaFromPolygon(body.beforeState.polygon);
        const afterArea =
            body.afterState.area ||
            calculateAreaFromPolygon(body.afterState.polygon);

        // Insert correction log into Supabase
        const { data, error } = await supabase
            .from('correction_logs')
            .insert([
                {
                    project_id: body.projectId,
                    file_id: body.fileId,
                    correction_type: body.correctionType,
                    unit_id: body.unitId,

                    // Before state
                    before_polygon:
                        body.beforeState.polygon &&
                            body.beforeState.polygon.length > 0
                            ? body.beforeState.polygon
                            : null,
                    before_classification: body.beforeState.classification || null,
                    before_area: beforeArea || null,

                    // After state
                    after_polygon:
                        body.afterState.polygon && body.afterState.polygon.length > 0
                            ? body.afterState.polygon
                            : null,
                    after_classification: body.afterState.classification || null,
                    after_area: afterArea || null,

                    // Confidence and context
                    ai_confidence: body.beforeState.aiConfidence || null,
                    correction_confidence: body.correctionConfidence,
                    operator_notes: body.operatorNotes || null,
                    original_ai_source: body.beforeState.aiSource || 'unknown',

                    // Metadata
                    mood_id: body.moodId || null,
                    input_file_type: body.inputFileType,
                    created_by: body.operatorEmail || 'anonymous',
                    created_at: new Date().toISOString(),
                },
            ])
            .select();

        if (error) {
            console.error('[corrections/log] Supabase insert error:', error);
            return NextResponse.json(
                { error: 'Failed to log correction', detail: error.message },
                { status: 500 }
            );
        }

        // Update operator stats
        try {
            const { data: existingStats } = await supabase
                .from('operator_stats')
                .select('*')
                .eq('operator_name', body.operatorEmail || 'anonymous')
                .single();

            if (existingStats) {
                await supabase
                    .from('operator_stats')
                    .update({
                        total_corrections: (existingStats.total_corrections || 0) + 1,
                        avg_correction_confidence:
                            ((existingStats.avg_correction_confidence || 0) +
                                body.correctionConfidence) /
                            2,
                        last_active: new Date().toISOString(),
                    })
                    .eq('operator_name', body.operatorEmail || 'anonymous');
            } else {
                await supabase.from('operator_stats').insert([
                    {
                        operator_name: body.operatorEmail || 'anonymous',
                        total_corrections: 1,
                        avg_correction_confidence: body.correctionConfidence,
                        last_active: new Date().toISOString(),
                    },
                ]);
            }
        } catch (statsErr) {
            // Stats update failure shouldn't block correction logging
            console.warn('[corrections/log] Failed to update operator stats:', statsErr);
        }

        console.log(
            `[corrections/log] Logged ${body.correctionType} for unit ${body.unitId} (confidence: ${body.correctionConfidence})`
        );

        return NextResponse.json(
            {
                success: true,
                correctionId: data?.[0]?.id,
                message: `Correction logged: ${body.correctionType}`,
            },
            { status: 201 }
        );
    } catch (err) {
        console.error('[corrections/log] Error:', err);
        return NextResponse.json(
            { error: 'Internal server error', detail: String(err) },
            { status: 500 }
        );
    }
}
