import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'
import { useStore } from '../../store/useStore'

// Mock the store
vi.mock('../../store/useStore', () => ({
  useStore: vi.fn()
}))

// Mock ProjectManagerModal to avoid rendering issues
vi.mock('../ProjectManagerModal', () => ({
    ProjectManagerModal: () => <div data-testid="project-manager-modal" />
}))

describe('Sidebar clear all data behavior', () => {
    const mockClearData = vi.fn()
    const mockOnSelectProject = vi.fn()
    const mockSetDateRange = vi.fn()
    const mockToggleProjectVisibility = vi.fn()
    const mockReorderProjects = vi.fn()
    const mockSetReportGenerated = vi.fn()

    // Mock Date to have deterministic tests
    const mockDateRange = {
        from: new Date('2023-01-01T00:00:00.000Z'),
        to: new Date('2023-12-31T00:00:00.000Z')
    };

    const mockProjects = [
        { id: '1', name: 'Project 1', data: [], sharedFiles: [], lastModified: Date.now() },
        { id: '2', name: 'Project 2', data: [], sharedFiles: [], lastModified: Date.now() }
    ];

    beforeEach(() => {
        vi.clearAllMocks()
        // Default mock implementation
        ;(useStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            dateRange: mockDateRange,
            setDateRange: mockSetDateRange,
            hiddenProjects: [],
            toggleProjectVisibility: mockToggleProjectVisibility,
            reorderProjects: mockReorderProjects,
            setReportGenerated: mockSetReportGenerated,
            clearData: mockClearData
        })
    })

    it('should show confirm dialog and call clearData and onSelectProject when user confirms deletion', () => {
        // Mock window.confirm to return true
        const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true)

        render(
            <Sidebar
                projects={mockProjects}
                selectedProjectId={null}
                onSelectProject={mockOnSelectProject}
            />
        )

        const deleteButton = screen.getByText('ELIMINAR TODO')
        fireEvent.click(deleteButton)

        expect(confirmSpy).toHaveBeenCalledWith(
            '¿Estás seguro de que quieres borrar TODOS los datos y archivos compartidos? Esta acción eliminará los proyectos de este dispositivo y de la nube de forma permanente.'
        )
        expect(mockClearData).toHaveBeenCalledTimes(1)
        expect(mockOnSelectProject).toHaveBeenCalledWith(null)
        expect(mockOnSelectProject).toHaveBeenCalledTimes(1)

        confirmSpy.mockRestore()
    })

    it('should show confirm dialog but NOT call clearData or onSelectProject when user cancels deletion', () => {
        // Mock window.confirm to return false
        const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false)

        render(
            <Sidebar
                projects={mockProjects}
                selectedProjectId={null}
                onSelectProject={mockOnSelectProject}
            />
        )

        const deleteButton = screen.getByText('ELIMINAR TODO')
        fireEvent.click(deleteButton)

        expect(confirmSpy).toHaveBeenCalledWith(
            '¿Estás seguro de que quieres borrar TODOS los datos y archivos compartidos? Esta acción eliminará los proyectos de este dispositivo y de la nube de forma permanente.'
        )
        expect(mockClearData).not.toHaveBeenCalled()
        expect(mockOnSelectProject).not.toHaveBeenCalled()

        confirmSpy.mockRestore()
    })
})
