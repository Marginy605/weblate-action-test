import fs from 'fs/promises';
import {glob} from 'glob';
import path from 'path';
import {resolveComponents} from './utils';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('glob');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedGlob = glob as jest.MockedFunction<typeof glob>;

describe('resolveComponents', () => {
    const mainLanguage = 'en';

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock process.cwd()
        jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Direct path (non-glob)', () => {
        it('should resolve components from a direct path', async () => {
            const keysetsPath = 'src/i18n-keysets';
            const mockDirents = [
                {name: 'component1', isDirectory: () => true} as any,
                {name: 'component2', isDirectory: () => true} as any,
                {name: 'file.json', isDirectory: () => false} as any,
            ];

            mockedFs.readdir.mockResolvedValue(mockDirents);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toEqual([
                {
                    name: 'component1',
                    source: path.join(keysetsPath, 'component1', 'en.json'),
                    fileMask: path.join(keysetsPath, 'component1', '*.json'),
                },
                {
                    name: 'component2',
                    source: path.join(keysetsPath, 'component2', 'en.json'),
                    fileMask: path.join(keysetsPath, 'component2', '*.json'),
                },
            ]);

            expect(mockedFs.readdir).toHaveBeenCalledWith(
                path.resolve('/test/project', keysetsPath),
                {withFileTypes: true},
            );
        });

        it('should filter out hidden directories (starting with dot)', async () => {
            const keysetsPath = 'src/i18n-keysets';
            const mockDirents = [
                {name: 'component1', isDirectory: () => true} as any,
                {name: '.hidden', isDirectory: () => true} as any,
                {name: '..parent', isDirectory: () => true} as any,
            ];

            mockedFs.readdir.mockResolvedValue(mockDirents);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('component1');
        });

        it('should return empty array when no directories found', async () => {
            const keysetsPath = 'src/i18n-keysets';
            const mockDirents = [
                {name: 'file1.json', isDirectory: () => false} as any,
                {name: 'file2.json', isDirectory: () => false} as any,
            ];

            mockedFs.readdir.mockResolvedValue(mockDirents);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toEqual([]);
        });

        it('should use correct language in source path', async () => {
            const keysetsPath = 'src/i18n-keysets';
            const customLanguage = 'ru';
            const mockDirents = [
                {name: 'component1', isDirectory: () => true} as any,
            ];

            mockedFs.readdir.mockResolvedValue(mockDirents);

            const result = await resolveComponents(keysetsPath, customLanguage);

            expect(result[0].source).toBe(
                path.join(keysetsPath, 'component1', 'ru.json'),
            );
        });
    });

    describe('Glob pattern', () => {
        it('should detect glob pattern with asterisk', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = [
                'projects/project-a/src/i18n-keysets',
                'projects/project-b/src/i18n-keysets',
            ];

            mockedGlob.mockResolvedValue(matchedDirs as any);
            mockedFs.readdir.mockResolvedValue([
                {name: 'component1', isDirectory: () => true} as any,
            ]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(mockedGlob).toHaveBeenCalledWith(keysetsPath, {
                cwd: '/test/project',
                absolute: false,
                ignore: ['**/node_modules/**', '**/.git/**'],
            });

            expect(result).toHaveLength(2);
        });

        it('should detect glob pattern with question mark', async () => {
            const keysetsPath = 'projects/project-?/src/i18n-keysets';

            mockedGlob.mockResolvedValue([]);

            await resolveComponents(keysetsPath, mainLanguage);

            expect(mockedGlob).toHaveBeenCalled();
        });

        it('should detect glob pattern with square brackets', async () => {
            const keysetsPath = 'projects/project-[ab]/src/i18n-keysets';

            mockedGlob.mockResolvedValue([]);

            await resolveComponents(keysetsPath, mainLanguage);

            expect(mockedGlob).toHaveBeenCalled();
        });

        it('should add parent directory prefix to component names', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = [
                'projects/project-a/src/i18n-keysets',
                'projects/project-b/src/i18n-keysets',
            ];

            mockedGlob.mockResolvedValue(matchedDirs as any);

            // Mock different components for each directory
            mockedFs.readdir
                .mockResolvedValueOnce([
                    {name: 'component1', isDirectory: () => true} as any,
                ])
                .mockResolvedValueOnce([
                    {name: 'component2', isDirectory: () => true} as any,
                ]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            // The parent directory is extracted from the path after 'projects'
            // For 'projects/project-a/src/i18n-keysets', that would be 'project-a'
            expect(result).toEqual([
                {
                    name: 'project-a_component1',
                    source: path.join(
                        'projects/project-a/src/i18n-keysets',
                        'component1',
                        'en.json',
                    ),
                    fileMask: path.join(
                        'projects/project-a/src/i18n-keysets',
                        'component1',
                        '*.json',
                    ),
                },
                {
                    name: 'project-b_component2',
                    source: path.join(
                        'projects/project-b/src/i18n-keysets',
                        'component2',
                        'en.json',
                    ),
                    fileMask: path.join(
                        'projects/project-b/src/i18n-keysets',
                        'component2',
                        '*.json',
                    ),
                },
            ]);
        });

        it('should handle multiple components in glob-matched directories', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = ['projects/project-a/src/i18n-keysets'];

            mockedGlob.mockResolvedValue(matchedDirs as any);
            mockedFs.readdir.mockResolvedValue([
                {name: 'component1', isDirectory: () => true} as any,
                {name: 'component2', isDirectory: () => true} as any,
                {name: 'component3', isDirectory: () => true} as any,
            ]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('project-a_component1');
            expect(result[1].name).toBe('project-a_component2');
            expect(result[2].name).toBe('project-a_component3');
        });

        it('should filter out hidden directories in glob pattern', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = ['projects/project-a/src/i18n-keysets'];

            mockedGlob.mockResolvedValue(matchedDirs as any);
            mockedFs.readdir.mockResolvedValue([
                {name: 'component1', isDirectory: () => true} as any,
                {name: '.hidden', isDirectory: () => true} as any,
            ]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('project-a_component1');
        });

        it('should handle errors when reading glob-matched directories', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = [
                'projects/project-a/src/i18n-keysets',
                'projects/project-b/src/i18n-keysets',
            ];

            mockedGlob.mockResolvedValue(matchedDirs as any);

            // First directory succeeds, second fails
            mockedFs.readdir
                .mockResolvedValueOnce([
                    {name: 'component1', isDirectory: () => true} as any,
                ])
                .mockRejectedValueOnce(new Error('Permission denied'));

            const consoleWarnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation();

            const result = await resolveComponents(keysetsPath, mainLanguage);

            // Should still return components from successful directory
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('project-a_component1');

            // Should log warning for failed directory
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to read directory'),
                expect.any(Error),
            );

            consoleWarnSpy.mockRestore();
        });

        it('should return empty array when no directories match glob pattern', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';

            mockedGlob.mockResolvedValue([]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toEqual([]);
        });

        it('should handle empty directories in glob pattern', async () => {
            const keysetsPath = 'projects/*/src/i18n-keysets';
            const matchedDirs = ['projects/project-a/src/i18n-keysets'];

            mockedGlob.mockResolvedValue(matchedDirs as any);
            mockedFs.readdir.mockResolvedValue([]);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result).toEqual([]);
        });
    });

    describe('Edge cases', () => {
        it('should handle paths with special characters', async () => {
            const keysetsPath = 'src/i18n-keysets-v2';
            const mockDirents = [
                {name: 'component-1', isDirectory: () => true} as any,
            ];

            mockedFs.readdir.mockResolvedValue(mockDirents);

            const result = await resolveComponents(keysetsPath, mainLanguage);

            expect(result[0].name).toBe('component-1');
        });

        it('should handle different main languages', async () => {
            const keysetsPath = 'src/i18n-keysets';
            const languages = ['en', 'ru', 'de', 'fr', 'zh'];
            const mockDirents = [
                {name: 'component1', isDirectory: () => true} as any,
            ];

            for (const lang of languages) {
                mockedFs.readdir.mockResolvedValue(mockDirents);

                const result = await resolveComponents(keysetsPath, lang);

                expect(result[0].source).toBe(
                    path.join(keysetsPath, 'component1', `${lang}.json`),
                );
            }
        });
    });
});
