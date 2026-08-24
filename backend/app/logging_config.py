import logging
import sys


class _RequestIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


def configure_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(request_id)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]


logger = logging.getLogger("phantom_query")