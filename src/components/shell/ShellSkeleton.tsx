import { Skeleton } from '@/components/ui';
import styles from './AppShell.module.css';
import listStyles from '../list/ThreadList.module.css';

/** Static placeholder shown while the page reads its query string. */
export function ShellSkeleton() {
  return (
    <div className={styles.shell} aria-busy="true">
      <div className={styles.main}>
        <div className={styles.panes}>
          <div className={styles.listPane}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={listStyles.skeletonRow} aria-hidden="true">
                <Skeleton circle width={36} />
                <div className={listStyles.skeletonText}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="90%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
