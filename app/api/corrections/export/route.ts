import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Export corrections log for V2 ML training.
 * GET /api/corrections/export?projectId=xxx&format=json|csv
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const format = searchParams.get('format') || 'json';

    if (!projectId) {
        return NextResponse.json(
            { error: 'projectId query parameter required' },
            { status: 400 }
        );
    }

    try {
        const { data, error } = await supabase
            .from('correction_logs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            return NextResponse.json({
                projectId,
                totalCorrections: 0,
                corrections: [],
                exportedAt: new Date().toISOString(),
                message: 'No corrections found for this project',
            });
        }

        if (format === 'csv') {
            const csv = convertToCSV(data);
            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="corrections-${projectId}-${Date.now()}.csv"`,
                },
            });
        }

        // JSON format (for V2 ML pipeline)
        return NextResponse.json({
            projectId,
            totalCorrections: data.length,
            correctionsByType: {
                polygon_edit: data.filter(d => d.correction_type === 'polygon_edit').length,
                unit_classification: data.filter(d => d.correction_type === 'unit_classification').length,
                furniture_placement: data.filter(d => d.correction_type === 'furniture_placement').length,
            },
            corrections: data,
            exportedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[corrections/export] Error:', err);
        return NextResponse.json(
            { error: 'Failed to export corrections', detail: String(err) },
            { status: 500 }
        );
    }
}

/**
 * Convert corrections array to CSV format for V2 training dataset.
 */
function convertToCSV(data: any[]): string {
    if (data.length === 0) {
        return 'No corrections found';
    }

    const headers = [
        'Correction ID',
        'Unit ID',
        'Correction Type',
        'Classification Before',
        'Classification After',
        'Area Before (m²)',
        'Area After (m²)',
        'Polygon Points Before',
        'Polygon Points After',
        'AI Confidence',
        'Correction Confidence',
        'Operator',
        'Operator Notes',
        'AI Source',
        'Mood',
        'Input File Type',
        'Created At',
        'ML Label Verified',
        'ML Label Notes',
    ];

    const rows = data.map(row => {
        const beforePolygon = row.before_polygon
            ? JSON.stringify(row.before_polygon).replace(/"/g, "'")
            : '';
        const afterPolygon = row.after_polygon
            ? JSON.stringify(row.after_polygon).replace(/"/g, "'")
            : '';

        return [
            row.id || '',
            row.unit_id || '',
            row.correction_type || '',
            row.before_classification || '',
            row.after_classification || '',
            row.before_area || '',
            row.after_area || '',
            beforePolygon,
            afterPolygon,
            row.ai_confidence || '',
            row.correction_confidence || '',
            row.created_by || '',
            `"${(row.operator_notes || '').replace(/"/g, '""')}"`, // Escape quotes
            row.original_ai_source || '',
            row.mood_id || '',
            row.input_file_type || '',
            row.created_at || '',
            row.ml_label_verified ? 'Yes' : 'No',
            row.ml_label_notes || '',
        ];
    });

    const csv =
        headers.map(h => `"${h}"`).join(',') +
        '\n' +
        rows.map(row => row.join(',')).join('\n');

    return csv;
}

/**
 * GET stats about corrections for dashboard.
 * GET /api/corrections/stats?projectId=xxx
 */
export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'get-stats') {
        const body = await request.json();
        const { projectId } = body;

        if (!projectId) {
            return NextResponse.json(
                { error: 'projectId required' },
                { status: 400 }
            );
        }

        try {
            const { data: corrections } = await supabase
                .from('correction_logs')
                .select('*')
                .eq('project_id', projectId);

            const { data: operators } = await supabase
                .from('operator_stats')
                .select('*')
                .order('total_corrections', { ascending: false });

            const stats = {
                totalCorrections: corrections?.length || 0,
                byType: {
                    polygon_edit: corrections?.filter(c => c.correction_type === 'polygon_edit').length || 0,
                    unit_classification: corrections?.filter(c => c.correction_type === 'unit_classification').length || 0,
                    furniture_placement: corrections?.filter(c => c.correction_type === 'furniture_placement').length || 0,
                },
                avgConfidence:
                    corrections && corrections.length > 0
                        ? (
                            corrections.reduce(
                                (sum, c) => sum + (c.correction_confidence || 0),
                                0
                            ) / corrections.length
                        ).toFixed(2)
                        : 0,
                uniqueOperators: operators?.length || 0,
                topOperators: (operators || []).slice(0, 5),
            };

            return NextResponse.json(stats);
        } catch (err) {
            console.error('[corrections/stats] Error:', err);
            return NextResponse.json(
                { error: 'Failed to fetch stats', detail: String(err) },
                { status: 500 }
            );
        }
    }

    return NextResponse.json(
        { error: 'Unknown action' },
        { status: 400 }
    );
}
