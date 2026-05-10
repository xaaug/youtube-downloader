import { Button } from "@carbon/react";

interface Props {
    fetchData: () => Promise<void>
    fetching: boolean
}

const FetchButton: React.FC<Props> = ({fetchData, fetching}) => {


  return (
    <>
      <div>
        <Button kind="secondary" onClick={fetchData} disabled={fetching}>{fetching ? 'Fetching Video' : 'Fetch Video'}</Button>
      </div>
    </>
  );
};

export default FetchButton;
