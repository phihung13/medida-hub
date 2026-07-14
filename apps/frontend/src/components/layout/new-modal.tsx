import { create } from 'zustand';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useShallow } from 'zustand/react/shallow';
import React, {
  createContext,
  FC,
  memo,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Button } from '@gitroom/react/form/button';
import { useHotkeys } from 'react-hotkeys-hook';
import clsx from 'clsx';
import { EventEmitter } from 'events';

interface OpenModalInterface {
  title?: any;
  closeOnClickOutside?: boolean;
  removeLayout?: boolean;
  fullScreen?: boolean;
  /** Mobile (≤1025px): mặc định modal thường render thành BOTTOM SHEET trượt
   *  từ đáy (đại tu mobile 2026-07). Truyền sheet: false để giữ dialog giữa
   *  màn cả trên mobile. Desktop không bị ảnh hưởng bởi cờ này. */
  sheet?: boolean;
  top?: string | number;
  closeOnEscape?: boolean;
  withCloseButton?: boolean;
  askClose?: boolean;
  onClose?: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  classNames?: {
    modal?: string;
  };
  size?: string | number;
  maxSize?: string | number;
  height?: string | number;
  id?: string;
}

interface ModalManagerStoreInterface {
  closeById(id: string): void;
  openModal(params: OpenModalInterface): void;
  closeAll(): void;
}

interface State extends ModalManagerStoreInterface {
  modalManager: Array<{ id: string } & OpenModalInterface>;
}

const useModalStore = create<State>((set) => ({
  modalManager: [],
  openModal: (params) => {
    const newId = params.id || makeId(20);
    set((state) => ({
      modalManager: [
        ...state.modalManager,
        ...(!state.modalManager.some((p) => p.id === newId)
          ? [{ id: newId, ...params }]
          : []),
      ],
    }));
  },
  closeById: (id) =>
    set((state) => ({
      modalManager: state.modalManager.filter((modal) => modal.id !== id),
    })),
  closeAll: () => set({ modalManager: [] }),
}));

const CurrentModalContext = createContext({ id: '' });

interface ModalManagerInterface extends ModalManagerStoreInterface {
  closeCurrent(): void;
}

export const useModals = () => {
  const { closeAll, openModal, closeById } = useModalStore(
    useShallow((state) => ({
      openModal: state.openModal,
      closeById: state.closeById,
      closeAll: state.closeAll,
    }))
  );

  const modalContext = useContext(CurrentModalContext);

  return {
    openModal,
    closeAll,
    closeById,
    closeCurrent: () => {
      if (modalContext.id) {
        closeById(modalContext.id);
      }
    },
  } satisfies ModalManagerInterface;
};

export const Component: FC<{
  closeModal: (id: string) => void;
  zIndex: number;
  isLast: boolean;
  modal: { id: string } & OpenModalInterface;
}> = memo(({ isLast, modal, closeModal, zIndex }) => {
  const decision = useDecisionModal();
  const closeModalFunction = useCallback(async () => {
    if (modal.askClose) {
      const open = await decision.open();
      if (!open) {
        return;
      }
    }
    modal?.onClose?.();
    closeModal(modal.id);
  }, [modal.id, closeModal]);

  // ---- Bottom sheet mobile: vuốt tay cầm xuống để đóng (đại tu 2026-07) ----
  // Chỉ modal thường (không fullScreen/removeLayout, không sheet:false).
  const asSheet = modal.sheet !== false && !modal.fullScreen;
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const onDragStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
    if (panelRef.current) {
      // Gỡ animation mở (sheetIn) trước khi ghi transform inline — nếu không,
      // tầng animation-origin của cascade sẽ THẮNG inline style, panel không
      // bám theo ngón tay.
      panelRef.current.style.animation = 'none';
      panelRef.current.style.transition = 'none';
    }
  }, []);
  const onDragMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || !panelRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current);
    dragDelta.current = dy;
    panelRef.current.style.transform = `translateY(${dy}px)`;
  }, []);
  const resetPanel = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = 'transform 0.22s cubic-bezier(0.32,0.72,0,1)';
    panel.style.transform = '';
  }, []);
  const onDragEnd = useCallback(() => {
    const panel = panelRef.current;
    const delta = dragDelta.current;
    dragStartY.current = null;
    if (!panel) return;
    if (delta > 90) {
      if (modal.askClose) {
        // Có hộp xác nhận: KHÔNG trượt mù ra ngoài (bấm "No" sẽ kẹt panel).
        // Trả panel về chỗ rồi để closeModalFunction tự hỏi.
        resetPanel();
        closeModalFunction();
      } else {
        panel.style.transition = 'transform 0.2s ease-in';
        panel.style.transform = 'translateY(105%)';
        setTimeout(() => closeModalFunction(), 160);
      }
    } else {
      resetPanel();
    }
  }, [closeModalFunction, resetPanel, modal.askClose]);

  const RenderComponent = useMemo(() => {
    return typeof modal.children === 'function'
      ? modal.children(closeModalFunction)
      : modal.children;
  }, [modal, closeModalFunction]);

  useHotkeys(
    'Escape',
    () => {
      if (isLast) {
        closeModalFunction();
      }
    },
    [isLast, closeModalFunction]
  );

  if (modal.removeLayout) {
    return (
      <div
        style={{ zIndex }}
        className={clsx(
          !modal.fullScreen
            ? 'pb-[50px] min-w-full min-h-full'
            : 'w-full h-full',
          'fixed flex left-0 top-0 bg-popup transition-all animate-fadeIn overflow-y-auto text-newTextColor',
          !isLast && '!overflow-hidden'
        )}
      >
        <div className={clsx(modal.fullScreen && 'flex', 'relative flex-1')}>
          <div
            className={clsx(
              modal.fullScreen
                ? 'flex flex-1'
                : 'absolute top-0 left-0 min-w-full min-h-full'
            )}
          >
            <div
              className={clsx(
                modal.fullScreen ? 'w-full h-full flex-1' : 'mx-auto py-[48px]'
              )}
              {...(modal.size && { style: { width: modal.size } })}
            >
              {typeof modal.children === 'function'
                ? modal.children(closeModalFunction)
                : modal.children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CurrentModalContext.Provider value={{ id: modal.id }}>
      <div
        onClick={closeModalFunction}
        style={{ zIndex }}
        className={clsx(
          'fixed flex left-0 top-0 min-w-full min-h-full bg-popup transition-all animate-fadeIn overflow-y-auto text-newTextColor',
          !modal.fullScreen && 'pb-[50px]',
          // Sheet mobile phải dán sát ĐÁY màn — bỏ pb-[50px] để không hở dải
          // backdrop dưới đáy sheet (desktop giữ pb-[50px]).
          asSheet && 'mobile:!pb-0'
        )}
      >
        <div className="relative flex-1">
          <div
            style={
              modal.top
                ? { paddingTop: modal.top, paddingBottom: modal.top }
                : {}
            }
            className={clsx(
              'absolute min-w-full',
              !modal.fullScreen
                ? modal.top
                  ? ''
                  : 'min-h-full pt-[100px] pb-[100px]'
                : 'h-screen',
              modal.size && modal.height
                ? 'flex justify-center items-center'
                : 'top-0 left-0',
              // Sheet mobile: neo nội dung xuống ĐÁY màn (desktop giữ nguyên).
              asSheet &&
                'mobile:min-h-full mobile:flex mobile:flex-col mobile:!justify-end mobile:!items-stretch mobile:!pt-[40px] mobile:!pb-0'
            )}
          >
            <div
              ref={panelRef}
              className={clsx(
                !modal.removeLayout && 'gap-[40px] p-[32px]',
                'bg-newBgColorInner mx-auto flex flex-col w-fit rounded-[24px] relative',
                modal.size ? '' : 'min-w-[600px] mobile:min-w-0 mobile:w-[calc(100vw-24px)] mobile:max-w-full',
                modal.fullScreen && 'h-full',
                // Sheet mobile: full-width dán đáy, bo góc trên, trượt lên,
                // tự cuộn bên trong, chừa vùng an toàn thanh home.
                asSheet &&
                  'mobile:!w-full mobile:!min-w-0 mobile:!max-w-full mobile:mx-0 mobile:rounded-b-none mobile:rounded-t-[20px] mobile:!p-[16px] mobile:!pt-[6px] mobile:!gap-[14px] mobile:!pb-[calc(16px+env(safe-area-inset-bottom,0px))] mobile:animate-sheetIn mobile:max-h-[90dvh] mobile:overflow-y-auto'
              )}
              {...((!!modal.size || !!modal.height || !!modal.maxSize) && {
                style: {
                  ...(modal.size ? { width: modal.size } : {}),
                  ...(modal.height ? { height: modal.height } : {}),
                  ...(modal.maxSize ? { maxWidth: modal.maxSize } : {}),
                },
              })}
              onClick={(e) => e.stopPropagation()}
            >
              {asSheet && (
                <div
                  className="hidden mobile:flex justify-center py-[8px] -mx-[16px] touch-none cursor-grab"
                  onTouchStart={onDragStart}
                  onTouchMove={onDragMove}
                  onTouchEnd={onDragEnd}
                >
                  <div className="w-[36px] h-[5px] rounded-full bg-newTextColor/20" />
                </div>
              )}
              <div className="flex items-center">
                <div className="text-[24px] font-[600] flex-1 mobile:text-[17px]">
                  {modal.title}
                </div>
                {typeof modal.withCloseButton === 'undefined' ||
                modal.withCloseButton ? (
                  <div className="cursor-pointer">
                    <button
                      className="outline-none absolute end-[20px] top-[20px] mantine-UnstyledButton-root mantine-ActionIcon-root hover:bg-tableBorder cursor-pointer mantine-Modal-close mantine-1dcetaa mobile:end-[10px] mobile:top-[8px] mobile:w-[44px] mobile:h-[44px] mobile:rounded-full mobile:flex mobile:items-center mobile:justify-center"
                      type="button"
                      onClick={closeModalFunction}
                    >
                      <svg
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                          fill="currentColor"
                          fillRule="evenodd"
                          clipRule="evenodd"
                        ></path>
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                className={clsx(
                  'whitespace-pre-line',
                  !!modal.height && !!modal.size && 'flex flex-1 flex-col'
                )}
              >
                {RenderComponent}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CurrentModalContext.Provider>
  );
});

export const ModalManagerInner: FC = () => {
  const { closeModal, modalManager } = useModalStore(
    useShallow((state) => ({
      closeModal: state.closeById,
      modalManager: state.modalManager,
    }))
  );

  useEffect(() => {
    if (modalManager.length > 0) {
      document.querySelector('body')?.classList.add('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.add('blur-xs', 'pointer-events-none')
      );
    } else {
      document.querySelector('body')?.classList.remove('overflow-hidden');
      Array.from(document.querySelectorAll('.blurMe') || []).map((p) =>
        p.classList.remove('blur-xs', 'pointer-events-none')
      );
    }
  }, [modalManager]);

  if (modalManager.length === 0) {
    return null;
  }

  return (
    <>
      <style>{`body, html { overflow: hidden !important; }`}</style>
      {modalManager.map((modal, index) => (
        <Component
          isLast={modalManager.length - 1 === index}
          key={modal.id}
          modal={modal}
          zIndex={200 + index}
          closeModal={closeModal}
        />
      ))}
    </>
  );
};
export const ModalManager: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div>
      <ModalManagerEmitter />
      <ModalManagerInner />
      <div className="transition-all w-full">{children}</div>
    </div>
  );
};

const emitter = new EventEmitter();
export const showModalEmitter = (params: ModalManagerInterface) => {
  emitter.emit('show', params);
};

export const ModalManagerEmitter: FC = () => {
  const { showModal } = useModalStore(
    useShallow((state) => ({
      showModal: state.openModal,
    }))
  );

  useEffect(() => {
    emitter.on('show', (params: OpenModalInterface) => {
      showModal(params);
    });

    return () => {
      emitter.removeAllListeners('show');
    };
  }, []);
  return null;
};

export const DecisionModal: FC<{
  description: string;
  approveLabel: string;
  cancelLabel: string;
  onlyApprove: boolean;
  resolution: (value: boolean) => void;
}> = ({ description, cancelLabel, approveLabel, resolution, onlyApprove }) => {
  const { closeCurrent } = useModals();
  return (
    <div className="flex flex-col">
      <div>{description}</div>
      <div className="flex gap-[12px] mt-[16px]">
        <Button
          onClick={() => {
            resolution(true);
            closeCurrent();
          }}
        >
          {approveLabel}
        </Button>
        {!onlyApprove && (
          <Button
            onClick={() => {
              resolution(false);
              closeCurrent();
            }}
          >
            {cancelLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export const decisionModalEmitter = new EventEmitter();

export const areYouSure = ({
  title = 'Are you sure?',
  description = 'Are you sure you want to close this modal?' as any,
  approveLabel = 'Yes',
  cancelLabel = 'No',
} = {}): Promise<boolean> => {
  return new Promise<boolean>((newRes) => {
    decisionModalEmitter.emit('open', {
      title,
      description,
      approveLabel,
      cancelLabel,
      newRes,
    });
  });
};

export const DecisionEverywhere: FC = () => {
  const decision = useDecisionModal();
  useEffect(() => {
    decisionModalEmitter.on('open', decision.open);
  }, []);
  return null;
};

export const useDecisionModal = () => {
  const modals = useModals();
  const open = useCallback(
    ({
      title = 'Are you sure?',
      description = 'Are you sure you want to close this modal?' as any,
      onlyApprove = false,
      approveLabel = 'Yes',
      cancelLabel = 'No',
      newRes = undefined as any,
    } = {}) => {
      return new Promise<boolean>((res) => {
        modals.openModal({
          title,
          askClose: false,
          onClose: () => res(false),
          children: (
            <DecisionModal
              onlyApprove={onlyApprove}
              resolution={(value) => (newRes ? newRes(value) : res(value))}
              description={description}
              approveLabel={approveLabel}
              cancelLabel={cancelLabel}
            />
          ),
        });
      });
    },
    [modals]
  );

  return { open };
};
